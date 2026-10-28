import { test } from "node:test";
import assert from "node:assert/strict";
import { getConfig } from "../src/config.js";
import { loadSetup } from "../src/playbooks.js";
import { parseAddress, extractBody, stripQuoted, buildRaw, b64urlDecode, b64urlEncode } from "../src/mime.js";
import { normalizeMessage } from "../src/gmail.js";
import { validateTriage, buildTriagePrompt } from "../src/claude.js";
import { planTask, createTask } from "../src/linear.js";
import { findWaiting } from "../src/waiting.js";
import { runPosta, buildDraft } from "../src/run.js";
import { handleWebhook } from "../src/webhook.js";
import { loadExample, fakeGmail, fakeTriage, fakeLinear, toGmail, toThread } from "../scripts/examples.js";

const { inbox, triage } = loadExample();
const NOW = new Date(inbox.now);
const config = { ...getConfig({}), myName: inbox.me.name, playbook: inbox.playbook, webhookSecret: "s3cret", dryRun: false, reviewMode: false, minConfidence: 0.6 };
const setup = loadSetup(config.rootDir, config.playbook);
const me = { email: inbox.me.email, name: inbox.me.name };
const quiet = () => {};

async function run(over = {}, opts = {}) {
  const gmail = fakeGmail(inbox);
  const linear = fakeLinear();
  const logs = [];
  const r = await runPosta({ config: { ...config, ...over }, setup, gmail, linear, triage: opts.triage || fakeTriage(triage), now: NOW, log: (l) => logs.push(l) });
  return { ...r, gmail, linear, logs };
}
const decodeRaw = (raw) => {
  const s = b64urlDecode(raw);
  const [head, ...rest] = s.split("\r\n\r\n");
  return { head, body: Buffer.from(rest.join("\r\n\r\n").replace(/\r\n/g, ""), "base64").toString("utf8") };
};

// --- reading email ---
test("parses names and addresses", () => {
  assert.deepEqual(parseAddress('"Medina, Sofía" <Sofia@CasaVerde.example>'), { name: "Medina, Sofía", email: "sofia@casaverde.example" });
  assert.deepEqual(parseAddress("ana@x.com"), { name: "", email: "ana@x.com" });
});

test("reads plain text first and falls back to HTML", () => {
  const html = { mimeType: "multipart/alternative", parts: [{ mimeType: "text/html", body: { data: b64urlEncode("<p>Hello <b>there</b></p><p>Line&nbsp;2</p>") } }] };
  assert.equal(extractBody(html), "Hello there\nLine 2");
});

test("drops quoted reply history", () => {
  assert.equal(stripQuoted("Thanks!\n\nOn Mon, 26 Oct 2026, Inês wrote:\n> old text"), "Thanks!");
});

test("flags newsletters and automated senders", () => {
  const [news, alert, person] = ["e10", "e04", "e01"].map((id) => normalizeMessage(fakeGmailMessage(id)));
  assert.equal(news.promotional, true);
  assert.equal(alert.automated, true);
  assert.equal(alert.promotional, false);
  assert.equal(person.automated, false);
});
function fakeGmailMessage(id) { return toGmail(inbox.emails.find((e) => e.id === id)); }

// --- Claude output is never trusted blindly ---
test("validation: suspicious mail gets no task and no draft", () => {
  const emails = inbox.emails.filter((e) => e.id === "e12").map((e) => normalizeMessage(fakeGmailMessage(e.id)));
  const [t] = validateTriage({ emails: triage.emails.filter((x) => x.id === "e12") }, emails);
  assert.equal(t.suspicious, true);
  assert.equal(t.task, null);
  assert.equal(t.draft_reply, null);
});

test("validation: no drafts to automated senders, bad dates dropped, missing emails kept", () => {
  const emails = ["e05", "e01"].map((id) => normalizeMessage(fakeGmailMessage(id)));
  const [alert, missing] = validateTriage({ emails: [{ ...triage.emails.find((x) => x.id === "e05"), deadline: "next week" }] }, emails);
  assert.equal(alert.draft_reply, null);
  assert.equal(alert.deadline, null);
  assert.equal(missing.category, "fyi");
  assert.equal(missing.headline, "Valle de Bravo opening moved to 3 March");
});

test("prompt treats emails as untrusted and includes both playbooks and the voice", () => {
  const { system, user } = buildTriagePrompt([normalizeMessage(fakeGmailMessage("e12"))], setup, me, "2026-10-28");
  assert.match(system, /untrusted content/);
  assert.match(system, /<rules_for_everyone>/);
  assert.match(system, /<rules_for_account_management>/);
  assert.match(system, /<reader_voice_for_drafts>/);
  assert.match(user, /<email id="e12">/);
});

// --- tasks ---
test("low-confidence tasks are flagged, unassigned and labelled for review", () => {
  const e = normalizeMessage(fakeGmailMessage("e06"));
  const [t] = validateTriage({ emails: triage.emails.filter((x) => x.id === "e06") }, [e]);
  const p = planTask(e, t, config);
  assert.equal(p.flagged, true);
  assert.equal(p.assignToMe, false);
  assert.deepEqual(p.labels, ["Posta", "Needs review"]);
  assert.match(p.description, /posta-ref:e06/);
});

test("never creates the same task twice", async () => {
  const linear = { ...fakeLinear(), existing: async () => ({ identifier: "AM-7", url: "u" }) };
  const r = await createTask({ ref: "posta-ref:e01", labels: [] }, "AM", linear);
  assert.equal(r.existed, true);
  assert.equal(linear.created.length, 0);
});

// --- waiting on others ---
test("finds threads where you sent the last message and nobody replied", () => {
  const threads = inbox.sent.map(toThread);
  const w = findWaiting(threads, me.email, { now: NOW, waitDays: 3 });
  assert.deepEqual(w.map((x) => x.threadId), ["s01", "s02"]); // s03 got a reply, s04 is only a day old
});

// --- the full morning run ---
test("full run: tasks, drafts, one briefing to me, everything labelled", async () => {
  const { gmail, linear, briefing, stats } = await run();
  assert.equal(stats.skipped, 2); // newsletter + LinkedIn never reach Claude
  assert.equal(linear.created.length, 6);
  assert.equal(gmail.calls.drafts.length, 4);
  assert.equal(gmail.calls.sent.length, 1);
  assert.match(decodeRaw(gmail.calls.sent[0]).head, /To: Inês Duarte <ines@brightline.example>|To: =\?UTF-8\?B\?.+\?= <ines@brightline.example>/);
  assert.equal(gmail.calls.labelled.length, 13);
  assert.equal(briefing.counts.needs, 7);
  assert.equal(briefing.counts.careful, 1);
  assert.equal(briefing.counts.waiting, 2);
  assert.match(briefing.subject, /7 need you/);
});

test("drafts only go back to the original sender, as a reply in the same thread", async () => {
  const { gmail } = await run();
  const d = gmail.calls.drafts.find((x) => x.threadId === "t01");
  const { head, body } = decodeRaw(d.raw);
  assert.match(head, /To: =\?UTF-8\?B\?.+\?= <sofia.medina@casaverde.example>|To: Sofía Medina <sofia.medina@casaverde.example>/);
  assert.doesNotMatch(head, /priya@/); // cc'd colleague is not added
  assert.match(head, /In-Reply-To: <e01@example>/);
  assert.match(body, /revised launch plan/);
  assert.ok(!gmail.calls.drafts.some((x) => x.threadId === "t12")); // nothing for the suspicious email
});

test("dry run creates nothing, sends nothing and labels nothing", async () => {
  const { gmail, linear, briefing } = await run({ dryRun: true });
  assert.equal(linear.created.length, 0);
  assert.equal(gmail.calls.drafts.length, 0);
  assert.equal(gmail.calls.sent.length, 0);
  assert.equal(gmail.calls.labelled.length, 0);
  assert.equal(briefing.counts.needs, 7);
});

test("if Claude fails, those emails stay unlabelled so tomorrow retries them", async () => {
  const failing = async () => { throw new Error("overloaded"); };
  const { gmail, stats } = await run({}, { triage: failing });
  assert.ok(stats.errors > 0);
  assert.deepEqual(gmail.calls.labelled.sort(), ["e10", "e11"]);
});

test("logs contain counts only, never email content", async () => {
  const { logs } = await run();
  const all = logs.join("\n");
  for (const secret of ["Valle de Bravo", "Halden", "bank details", "sofia"]) assert.ok(!all.includes(secret), secret);
});

test("buildDraft uses Reply-To when present and adds Re:", () => {
  const e = { ...normalizeMessage(fakeGmailMessage("e02")), replyTo: { name: "", email: "sales@halden.example" } };
  const { head } = decodeRaw(buildDraft(e, "Hi", me));
  assert.match(head, /To: sales@halden.example/);
  assert.match(head, /Subject: Re: Paid social for the Nordics/);
});

// --- Zapier mode ---
test("webhook: rejects a wrong secret, triages and returns the draft for Zapier", async () => {
  const bad = await handleWebhook({ method: "POST", headers: { "x-posta-secret": "nope" }, body: {} }, { config, setup });
  assert.equal(bad.status, 401);
  const e = inbox.emails.find((x) => x.id === "e09");
  const ok = await handleWebhook(
    { method: "POST", headers: { "x-posta-secret": "s3cret" }, body: JSON.stringify({ message_id: "e09", from: e.from, to: e.to, subject: e.subject, body_plain: e.body, date: e.date }) },
    { config, setup, deps: { triage: fakeTriage(triage), linear: fakeLinear() } }
  );
  assert.equal(ok.status, 200);
  assert.equal(ok.body.create_draft, true);
  assert.equal(ok.body.draft_to, "carla.ruiz@casaverde.example");
  assert.equal(ok.body.draft_subject, "Re: Our intro call on Friday");
});

// --- Gmail sign-in ---
import { createGmailClient } from "../src/gmail.js";
test("Gmail client refreshes the access token once and explains expired tokens", async () => {
  const calls = [];
  const ok = (body) => ({ ok: true, status: 200, json: async () => body });
  const g = createGmailClient({
    clientId: "c", clientSecret: "s", refreshToken: "r",
    fetchImpl: async (url, opts) => {
      calls.push({ url, auth: opts.headers?.authorization });
      return url.includes("oauth2") ? ok({ access_token: "tok", expires_in: 3600 }) : ok({ emailAddress: "me@x.com" });
    },
  });
  await g.profile(); await g.profile();
  assert.equal(calls.filter((c) => c.url.includes("oauth2")).length, 1);
  assert.equal(calls[1].auth, "Bearer tok");
  const expired = createGmailClient({ clientId: "c", clientSecret: "s", refreshToken: "r",
    fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ error: "invalid_grant" }) }) });
  await assert.rejects(expired.profile(), /npm run authorize/);
});
