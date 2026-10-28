// "Waiting on others": threads where you sent the last message and nobody has replied for a few days.
// Worked out from Gmail metadata only (no Claude, no email bodies).
import { header, parseAddress, parseAddressList } from "./mime.js";

const NOT_A_PERSON = /(no-?reply|do-?not-?reply|notifications?|mailer-daemon)/i;

export function findWaiting(threads, myEmail, { now = new Date(), waitDays = 3, maxDays = 14 } = {}) {
  const me = myEmail.toLowerCase();
  const out = [];
  for (const t of threads) {
    const msgs = [...(t.messages || [])].sort((a, b) => Number(a.internalDate) - Number(b.internalDate));
    const last = msgs[msgs.length - 1];
    if (!last) continue;
    const h = last.payload?.headers || [];
    if (parseAddress(header(h, "From")).email !== me) continue;
    const to = parseAddressList(header(h, "To")).filter((a) => a.email !== me && !NOT_A_PERSON.test(a.email));
    if (!to.length) continue;
    const days = Math.floor((now.getTime() - Number(last.internalDate)) / 86_400_000);
    if (days < waitDays || days > maxDays) continue;
    out.push({
      threadId: t.id,
      subject: header(h, "Subject") || "(no subject)",
      to,
      sentAt: new Date(Number(last.internalDate)).toISOString(),
      days,
    });
  }
  return out.sort((a, b) => b.days - a.days);
}
