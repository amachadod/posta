// Builds the morning briefing email (HTML + plain text). Email clients only support simple,
// inline-styled HTML, so this stays deliberately plain.
import { gmailLink } from "./linear.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const RANK = { urgent: 0, high: 1, medium: 2, low: 3 };

function fmtDay(iso, tz, withWeekday = true) {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso);
  return d.toLocaleDateString("en-GB", { timeZone: tz, day: "numeric", month: "short", ...(withWeekday ? { weekday: "short" } : {}) });
}
const who = (a) => a.name || a.email;

/**
 * items: [{ email, triage, task: {identifier,url}|null, drafted: bool }]
 * waiting: from findWaiting()
 */
export function buildBriefing({ me, items, waiting, skipped, now = new Date(), timezone = "Europe/Lisbon" }) {
  const needs = items.filter((i) => i.triage.category === "needs_you" && !i.triage.suspicious).sort((a, b) =>
    (RANK[a.triage.task?.priority] ?? 2) - (RANK[b.triage.task?.priority] ?? 2) ||
    String(a.triage.deadline || "9999").localeCompare(String(b.triage.deadline || "9999")));
  const careful = items.filter((i) => i.triage.suspicious);
  const fyi = items.filter((i) => i.triage.category === "fyi" && !i.triage.suspicious);
  const skippedTotal = skipped + items.filter((i) => i.triage.category === "skip").length;

  const day = fmtDay(now.toISOString(), timezone);
  const first = (me.name || "").split(" ")[0];
  const counts = `${needs.length} need${needs.length === 1 ? "s" : ""} you · ${waiting.length} waiting · ${fyi.length} worth knowing · ${skippedTotal} skipped`;
  const subject = `Posta · ${day} · ${needs.length ? `${needs.length} need${needs.length === 1 ? "s" : ""} you` : "nothing urgent"}`;

  // ---- plain text ----
  const t = [`Good morning${first ? `, ${first}` : ""}. ${counts}.`, ""];
  const tSection = (title, rows) => { if (rows.length) t.push(title.toUpperCase(), ...rows, ""); };
  tSection("Needs you", needs.map((i) => `- ${i.triage.headline}\n  ${who(i.email.from)}${i.triage.deadline ? ` · due ${fmtDay(i.triage.deadline, timezone)}` : ""}${i.task ? ` · ${i.task.identifier}` : ""}${i.drafted ? " · draft ready" : ""}\n  ${gmailLink(i.email.threadId)}`));
  tSection("Be careful", careful.map((i) => `- ${i.triage.headline}\n  ${who(i.email.from)} · ${i.triage.suspicious_reason}`));
  tSection("Waiting on others", waiting.map((w) => `- ${w.subject}\n  ${w.to.map(who).join(", ")} · no reply for ${w.days} days\n  ${gmailLink(w.threadId)}`));
  tSection("Worth knowing", fyi.map((i) => `- ${i.triage.headline} (${who(i.email.from)})`));
  t.push(`${skippedTotal} newsletters and notifications skipped.`, "Posta never sends email for you. Drafts are waiting in your Gmail drafts.");
  const text = t.join("\n");

  // ---- HTML ----
  const C = { ink: "#1b1d22", muted: "#667085", line: "#e4e7ec", accent: "#b4461f", soft: "#f6f4f1", warn: "#9a3412" };
  const link = (href, label) => `<a href="${esc(href)}" style="color:${C.accent};text-decoration:none">${esc(label)}</a>`;
  const chip = (label, color = C.muted) => `<span style="display:inline-block;font-size:12px;color:${color};border:1px solid ${C.line};border-radius:10px;padding:0 8px;margin-right:4px">${esc(label)}</span>`;
  const row = (main, meta) => `<tr><td style="padding:12px 0;border-top:1px solid ${C.line}"><div style="font-size:15px;font-weight:600;color:${C.ink};line-height:1.4">${main}</div><div style="font-size:13px;color:${C.muted};margin-top:4px;line-height:1.6">${meta}</div></td></tr>`;
  const section = (title, rows, note = "") => !rows.length ? "" :
    `<tr><td style="padding:24px 0 4px"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${C.muted};font-weight:600">${esc(title)} · ${rows.length}</div>${note}</td></tr>${rows.join("")}`;

  const needsRows = needs.map((i) => row(esc(i.triage.headline), [
    esc(who(i.email.from)),
    i.triage.deadline ? chip(`Due ${fmtDay(i.triage.deadline, timezone)}`, C.warn) : "",
    i.task ? chip(i.task.identifier) : "",
    i.drafted ? chip("Draft ready") : "",
    link(gmailLink(i.email.threadId), "Open email"),
    i.task?.url ? " · " + link(i.task.url, "Open task") : "",
  ].filter(Boolean).join(" ")));
  const carefulRows = careful.map((i) => row(esc(i.triage.headline), `${esc(who(i.email.from))} · <span style="color:${C.warn}">${esc(i.triage.suspicious_reason)}</span> · ${link(gmailLink(i.email.threadId), "Open email")}`));
  const waitRows = waiting.map((w) => row(esc(w.subject), `${esc(w.to.map(who).join(", "))} · no reply for ${w.days} days · ${link(gmailLink(w.threadId), "Open thread")}`));
  const fyiRows = fyi.map((i) => row(`<span style="font-weight:500">${esc(i.triage.headline)}</span>`, esc(who(i.email.from))));

  const html = `<!doctype html><html><body style="margin:0;background:${C.soft};font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.soft}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${C.line};border-radius:10px">
<tr><td style="padding:24px 28px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td><div style="font-size:13px;color:${C.accent};font-weight:700;letter-spacing:.04em">POSTA · ${esc(day.toUpperCase())}</div>
<div style="font-size:22px;font-weight:700;color:${C.ink};margin-top:6px">Good morning${first ? `, ${esc(first)}` : ""}.</div>
<div style="font-size:14px;color:${C.muted};margin-top:4px">${esc(counts)}</div></td></tr>
${section("Needs you", needsRows)}
${section("Be careful", carefulRows, `<div style="font-size:13px;color:${C.muted};margin-top:4px">Posta took no action on these. Don't click links or pay anything until you've checked the sender.</div>`)}
${section("Waiting on others", waitRows)}
${section("Worth knowing", fyiRows)}
<tr><td style="padding-top:24px;font-size:12px;color:${C.muted};line-height:1.6;border-top:1px solid ${C.line}">${skippedTotal} newsletters and notifications skipped.<br>Posta never sends email for you. Drafts are waiting in your Gmail drafts.</td></tr>
</table></td></tr></table></td></tr></table></body></html>`;

  return { subject, text, html, counts: { needs: needs.length, careful: careful.length, waiting: waiting.length, fyi: fyi.length, skipped: skippedTotal } };
}
