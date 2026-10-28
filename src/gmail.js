// Gmail API client (https://developers.google.com/gmail/api). Uses a refresh token from `npm run authorize`.
// Scope: gmail.modify, which lets Posta read mail, add its "Posta" label, create drafts and email you the briefing.
// It can't permanently delete anything.

import { header, parseAddress, parseAddressList, extractBody, stripQuoted, buildRaw } from "./mime.js";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const POSTA_LABEL = "Posta";

export function createGmailClient({ clientId, clientSecret, refreshToken, fetchImpl = fetch }) {
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Gmail is not connected. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN (see README: Connect Gmail).");
  }
  let token = null;

  async function accessToken() {
    if (token && token.expires > Date.now() + 60_000) return token.value;
    const res = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }).toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const hint = data.error === "invalid_grant" ? " The refresh token expired or was revoked: run npm run authorize again (and see the README note on 'Testing' apps)." : "";
      throw new Error(`Google sign-in failed (${data.error || res.status}).${hint}`);
    }
    token = { value: data.access_token, expires: Date.now() + (data.expires_in || 3600) * 1000 };
    return token.value;
  }

  async function call(path, { method = "GET", body, params } = {}) {
    const url = new URL(API + path);
    for (const [k, v] of Object.entries(params || {})) [].concat(v).forEach((x) => x !== undefined && url.searchParams.append(k, x));
    const res = await fetchImpl(url.toString(), {
      method,
      headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Gmail API error ${res.status} on ${method} ${path}`);
    return res.status === 204 ? {} : res.json();
  }

  async function profile() {
    return call("/profile");
  }

  async function listMessageIds(q, max = 50) {
    const ids = [];
    let pageToken;
    do {
      const page = await call("/messages", { params: { q, maxResults: Math.min(100, max - ids.length), pageToken } });
      ids.push(...(page.messages || []));
      pageToken = page.nextPageToken;
    } while (pageToken && ids.length < max);
    return ids.slice(0, max);
  }

  const getMessage = (id) => call(`/messages/${id}`, { params: { format: "full" } });
  const getThread = (id) => call(`/threads/${id}`, { params: { format: "metadata", metadataHeaders: ["From", "To", "Subject", "Date"] } });

  async function ensureLabel(name = POSTA_LABEL) {
    const { labels = [] } = await call("/labels");
    const found = labels.find((l) => l.name === name);
    if (found) return found.id;
    const made = await call("/labels", { method: "POST", body: { name, labelListVisibility: "labelShow", messageListVisibility: "show" } });
    return made.id;
  }

  async function addLabel(ids, labelId) {
    for (let i = 0; i < ids.length; i += 1000) {
      await call("/messages/batchModify", { method: "POST", body: { ids: ids.slice(i, i + 1000), addLabelIds: [labelId] } });
    }
  }

  const createDraft = (raw, threadId) => call("/drafts", { method: "POST", body: { message: { raw, threadId } } });
  const sendRaw = (raw) => call("/messages/send", { method: "POST", body: { raw } });

  return { profile, listMessageIds, getMessage, getThread, ensureLabel, addLabel, createDraft, sendRaw };
}

const AUTOMATED = /(^|[._+-])(no-?reply|do-?not-?reply|notifications?|alerts?|mailer-daemon|postmaster|bounce|updates?|news(letter)?)([._+-]|@)/i;

// Turns a Gmail API message into the plain shape Posta works with.
export function normalizeMessage(m, maxBody = 3000) {
  const h = m.payload?.headers || [];
  const from = parseAddress(header(h, "From"));
  const replyTo = header(h, "Reply-To") ? parseAddress(header(h, "Reply-To")) : null;
  const labels = m.labelIds || [];
  const listUnsub = !!header(h, "List-Unsubscribe");
  const bulk = /bulk|list|junk/i.test(header(h, "Precedence"));
  const body = stripQuoted(extractBody(m.payload)).slice(0, maxBody);
  return {
    id: m.id,
    threadId: m.threadId,
    messageId: header(h, "Message-ID") || header(h, "Message-Id"),
    references: header(h, "References"),
    from,
    replyTo,
    to: parseAddressList(header(h, "To")),
    cc: parseAddressList(header(h, "Cc")),
    subject: header(h, "Subject") || "(no subject)",
    date: new Date(Number(m.internalDate) || Date.parse(header(h, "Date")) || Date.now()).toISOString(),
    snippet: m.snippet || "",
    body,
    labels,
    // Signals used to decide what Claude needs to see and whether a reply makes sense.
    automated: AUTOMATED.test(from.email) || listUnsub || bulk,
    promotional: labels.some((l) => ["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_FORUMS"].includes(l)) || (listUnsub && bulk),
  };
}

export { buildRaw };
