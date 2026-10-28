// Creates tasks in Linear (https://linear.app/developers) from emails that need real work.

const API_URL = "https://api.linear.app/graphql";
const PRIORITY = { urgent: 1, high: 2, medium: 3, low: 4 };
export const emailRef = (id) => `posta-ref:${id}`;
export const gmailLink = (threadId) => `https://mail.google.com/mail/u/0/#all/${threadId}`;

export function createLinearClient({ apiKey, fetchImpl = fetch }) {
  if (!apiKey) throw new Error("LINEAR_API_KEY is not set.");
  const cache = new Map();

  async function gql(query, variables) {
    const res = await fetchImpl(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: apiKey },
      body: JSON.stringify({ query, variables }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.errors) throw new Error(`Linear API error: ${data.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}`}`);
    return data.data;
  }
  const once = async (key, fn) => (cache.has(key) ? cache.get(key) : (cache.set(key, await fn()), cache.get(key)));

  // The person whose API key this is. Posta's tasks are for them.
  const viewerId = () => once("viewer", async () => (await gql(`{viewer{id}}`)).viewer.id);

  const teamId = (key) => once(`team:${key}`, async () => {
    const d = await gql(`query($key:String!){teams(filter:{key:{eq:$key}}){nodes{id}}}`, { key });
    const id = d.teams.nodes[0]?.id;
    if (!id) throw new Error(`No Linear team with key "${key}". Set linear_team in your playbook or LINEAR_TEAM.`);
    return id;
  });

  const labelId = (name, team) => once(`label:${team}:${name}`, async () => {
    const d = await gql(`query($n:String!){issueLabels(filter:{name:{eqIgnoreCase:$n}}){nodes{id team{id}}}}`, { n: name });
    return (d.issueLabels.nodes.find((l) => l.team?.id === team) || d.issueLabels.nodes.find((l) => !l.team))?.id || null;
  });

  async function existing(ref) {
    const d = await gql(`query($ref:String!){issues(first:1,filter:{description:{contains:$ref}}){nodes{identifier url}}}`, { ref });
    return d.issues.nodes[0] || null;
  }

  async function createIssue(input) {
    const d = await gql(`mutation($input:IssueCreateInput!){issueCreate(input:$input){success issue{identifier url}}}`, { input });
    if (!d.issueCreate.success) throw new Error("Linear refused to create the issue.");
    return d.issueCreate.issue;
  }

  return { viewerId, teamId, labelId, existing, createIssue };
}

// Pure: decides what the Linear issue looks like. Easy to test.
export function planTask(email, t, { reviewMode, minConfidence }) {
  const flagged = reviewMode || t.task.confidence < minConfidence;
  const lines = [];
  if (flagged) lines.push("> ⚠️ **Needs review.** Posta was not fully sure about this task. Check it before starting.\n");
  if (t.task.description) lines.push(t.task.description, "");
  if (t.task.evidence) lines.push("**From the email:**", `> ${t.task.evidence.replace(/\n/g, "\n> ")}`, "");
  lines.push(
    `**Email:** [${email.subject}](${gmailLink(email.threadId)}) from ${email.from.name || email.from.email} · ${email.date.slice(0, 10)}`,
    `**Confidence:** ${Math.round(t.task.confidence * 100)}%`,
    "",
    `_Created by Posta · ${emailRef(email.id)}_`
  );
  return {
    title: t.task.title,
    description: lines.join("\n"),
    priority: PRIORITY[t.task.priority] ?? 3,
    dueDate: t.task.due_date || t.deadline || null,
    assignToMe: !flagged,
    labels: flagged ? ["Posta", "Needs review"] : ["Posta"],
    flagged,
    ref: emailRef(email.id),
  };
}

export async function createTask(plan, teamKey, client) {
  const found = await client.existing(plan.ref);
  if (found) return { ...found, existed: true };
  const team = await client.teamId(teamKey);
  const input = { teamId: team, title: plan.title, description: plan.description, priority: plan.priority };
  if (plan.dueDate) input.dueDate = plan.dueDate;
  if (plan.assignToMe) input.assigneeId = await client.viewerId();
  const labelIds = (await Promise.all(plan.labels.map((l) => client.labelId(l, team)))).filter(Boolean);
  if (labelIds.length) input.labelIds = labelIds;
  return client.createIssue(input);
}
