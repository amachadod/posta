// Small helpers for reading and writing email messages (MIME), with no dependencies.

export const b64urlDecode = (s) => Buffer.from(String(s || "").replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
export const b64urlEncode = (s) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function header(headers, name) {
  const h = (headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : "";
}

// "Ana Ruiz <ana@x.com>" -> { name, email }
export function parseAddress(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  return { name: "", email: s.toLowerCase() };
}
export const parseAddressList = (raw) =>
  String(raw || "").split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((x) => x.trim()).filter(Boolean).map(parseAddress);

export function htmlToText(html) {
  return String(html || "")
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Finds the readable body of a Gmail message payload: plain text first, HTML as a fallback.
export function extractBody(payload) {
  let plain = "", html = "";
  (function walk(part) {
    if (!part) return;
    const type = (part.mimeType || "").toLowerCase();
    if (type === "text/plain" && part.body?.data && !plain) plain = b64urlDecode(part.body.data);
    else if (type === "text/html" && part.body?.data && !html) html = b64urlDecode(part.body.data);
    (part.parts || []).forEach(walk);
  })(payload);
  return plain || htmlToText(html);
}

// Drops the quoted history under a reply ("On Tue, Ana wrote:" and "> ..." lines), to save tokens.
export function stripQuoted(text) {
  const lines = String(text || "").split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    if (/^On .{0,200}wrote:\s*$/i.test(line) || /^-{2,}\s*Original Message\s*-{2,}/i.test(line) || /^From: .+@.+/.test(line) && out.length > 3) break;
    if (/^\s*>/.test(line)) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

const encodeHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);
const formatAddress = (a) => (a.name ? `${encodeHeader(a.name.replace(/"/g, ""))} <${a.email}>` : a.email);
const wrap76 = (b64) => b64.replace(/(.{76})/g, "$1\r\n");

// Builds a raw RFC 822 message, base64url-encoded for the Gmail API.
export function buildRaw({ from, to, subject, text, html, inReplyTo, references }) {
  const head = [
    `From: ${formatAddress(from)}`,
    `To: ${[].concat(to).map(formatAddress).join(", ")}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
  ];
  if (inReplyTo) head.push(`In-Reply-To: ${inReplyTo}`);
  if (references) head.push(`References: ${references}`);
  let body;
  if (html) {
    const boundary = "posta_" + Math.random().toString(36).slice(2);
    head.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body = [
      `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap76(Buffer.from(text || "", "utf8").toString("base64")),
      `--${boundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap76(Buffer.from(html, "utf8").toString("base64")),
      `--${boundary}--`, "",
    ].join("\r\n");
  } else {
    head.push("Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64");
    body = wrap76(Buffer.from(text || "", "utf8").toString("base64"));
  }
  return b64urlEncode(head.join("\r\n") + "\r\n\r\n" + body);
}
