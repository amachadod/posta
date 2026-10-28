// Turns the readable example inbox (examples/inbox.json) into a fake Gmail account,
// so the demo and the tests run the real Posta code without any accounts or API keys.
import { readFileSync } from "node:fs";
import { b64urlEncode } from "../src/mime.js";
import { validateTriage } from "../src/claude.js";

const read = (f) => JSON.parse(readFileSync(new URL(`../examples/${f}`, import.meta.url), "utf8"));
export const loadExample = () => ({ inbox: read("inbox.json"), triage: read("triage.json") });

export function toGmail(e) {
  const headers = [
    { name: "From", value: e.from }, { name: "To", value: e.to }, { name: "Subject", value: e.subject },
    { name: "Date", value: new Date(e.date).toUTCString() }, { name: "Message-ID", value: `<${e.id}@example>` },
  ];
  if (e.cc) headers.push({ name: "Cc", value: e.cc });
  for (const [name, value] of Object.entries(e.headers || {})) headers.push({ name, value });
  return {
    id: e.id, threadId: e.threadId, labelIds: e.labels, snippet: e.body.slice(0, 120),
    internalDate: String(Date.parse(e.date)),
    payload: { mimeType: "multipart/alternative", headers, parts: [{ mimeType: "text/plain", body: { data: b64urlEncode(e.body) } }] },
  };
}

export function toThread(t) {
  return {
    id: t.threadId,
    messages: t.messages.map((m) => ({
      internalDate: String(Date.parse(m.date)),
      payload: { headers: [{ name: "From", value: m.from }, { name: "To", value: m.to }, { name: "Subject", value: t.subject }] },
    })),
  };
}

export function fakeGmail(inbox) {
  const calls = { drafts: [], sent: [], labelled: [] };
  const msgs = new Map(inbox.emails.map((e) => [e.id, toGmail(e)]));
  const threads = new Map(inbox.sent.map((t) => [t.threadId, toThread(t)]));
  return {
    calls,
    profile: async () => ({ emailAddress: inbox.me.email }),
    listMessageIds: async (q) => q.startsWith("in:sent")
      ? inbox.sent.map((t) => ({ id: t.threadId + "-m", threadId: t.threadId }))
      : inbox.emails.map((e) => ({ id: e.id, threadId: e.threadId })),
    getMessage: async (id) => msgs.get(id),
    getThread: async (id) => threads.get(id),
    ensureLabel: async () => "Label_posta",
    addLabel: async (ids) => { calls.labelled.push(...ids); },
    createDraft: async (raw, threadId) => { calls.drafts.push({ raw, threadId }); return { id: "d" + calls.drafts.length }; },
    sendRaw: async (raw) => { calls.sent.push(raw); return { id: "s" + calls.sent.length }; },
  };
}

// Fake Claude: returns the saved example answer for whichever emails it is given.
export const fakeTriage = (triage) => async (batch) => validateTriage({ emails: triage.emails.filter((t) => batch.some((e) => e.id === t.id)) }, batch);

export function fakeLinear() {
  const created = [];
  let n = 100;
  return {
    created,
    viewerId: async () => "user-me",
    teamId: async (k) => `team-${k}`,
    labelId: async (name) => `label-${name}`,
    existing: async () => null,
    createIssue: async (input) => { created.push(input); n++; return { identifier: `AM-${n}`, url: `https://linear.app/example/issue/AM-${n}` }; },
  };
}
