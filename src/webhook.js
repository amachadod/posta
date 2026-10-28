// Zapier mode: Zapier sends one email as soon as it arrives (Gmail or Outlook trigger).
// Posta triages it, creates the Linear task if needed, and returns the draft text so Zapier
// can save it as a draft with its own Gmail or Outlook action. The morning briefing needs the GitHub mode.
import { timingSafeEqual } from "node:crypto";
import { parseAddress, parseAddressList, stripQuoted, htmlToText } from "./mime.js";
import { triageBatch } from "./claude.js";
import { planTask, createTask, createLinearClient, gmailLink } from "./linear.js";

function sameSecret(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

export function emailFromZapier(p) {
  if (!p || typeof p !== "object") throw new Error("The webhook body must be a JSON object.");
  const body = p.body_plain || (p.body_html ? htmlToText(p.body_html) : "") || p.body || "";
  if (!p.from || !(body || p.subject)) throw new Error("Map at least the From, Subject and Body fields in Zapier.");
  const from = parseAddress(p.from_name ? `${p.from_name} <${p.from}>` : p.from);
  return {
    id: String(p.message_id || p.id || `${from.email}-${p.date || Date.now()}`),
    threadId: String(p.thread_id || p.message_id || ""),
    messageId: "", references: "",
    from, replyTo: p.reply_to ? parseAddress(p.reply_to) : null,
    to: parseAddressList(p.to), cc: parseAddressList(p.cc),
    subject: String(p.subject || "(no subject)"),
    date: new Date(Date.parse(p.date) || Date.now()).toISOString(),
    snippet: "", body: stripQuoted(body).slice(0, 3000), labels: [],
    automated: /(no-?reply|notifications?|mailer-daemon)/i.test(from.email),
    promotional: false,
  };
}

export async function handleWebhook({ method, headers, body }, { config, setup, deps = {} }) {
  if (method !== "POST") return { status: 405, body: { error: "Send a POST with the email as JSON." } };
  if (!config.webhookSecret) return { status: 500, body: { error: "POSTA_WEBHOOK_SECRET is not set on the server." } };
  if (!sameSecret(headers["x-posta-secret"], config.webhookSecret)) return { status: 401, body: { error: "Wrong or missing x-posta-secret header." } };
  let payload = body;
  if (typeof body === "string") { try { payload = JSON.parse(body); } catch { return { status: 400, body: { error: "Body is not valid JSON." } }; } }
  try {
    const email = emailFromZapier(payload);
    const me = { email: String(payload.to_me || email.to[0]?.email || "").toLowerCase(), name: config.myName };
    const triage = deps.triage || triageBatch;
    const [t] = await triage([email], setup, me, new Date().toISOString().slice(0, 10), { apiKey: config.anthropicKey, model: config.model });
    let task = null;
    const teamKey = config.linearTeam || setup.role.linearTeam;
    if (t.task && config.createTasks && teamKey && !config.dryRun) {
      const linear = deps.linear || createLinearClient({ apiKey: config.linearKey });
      task = await createTask(planTask(email, t, config), teamKey, linear);
    }
    return {
      status: 200,
      body: {
        category: t.category, headline: t.headline, deadline: t.deadline,
        suspicious: t.suspicious, suspicious_reason: t.suspicious_reason,
        task_id: task?.identifier || null, task_url: task?.url || null,
        // Use these in a Zapier "Create Draft" step. Posta never sends the reply itself.
        create_draft: !!t.draft_reply && config.createDrafts,
        draft_to: (email.replyTo || email.from).email,
        draft_subject: /^re:/i.test(email.subject) ? email.subject : `Re: ${email.subject}`,
        draft_body: t.draft_reply,
        email_link: email.threadId ? gmailLink(email.threadId) : null,
      },
    };
  } catch (err) {
    console.error("[posta]", err.message);
    return { status: 422, body: { error: err.message } };
  }
}
