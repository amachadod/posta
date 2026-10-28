// The daily run: read new email -> triage with Claude -> tasks in Linear -> drafts in Gmail -> briefing to you.
import { normalizeMessage, POSTA_LABEL, buildRaw } from "./gmail.js";
import { triageBatch } from "./claude.js";
import { planTask, createTask } from "./linear.js";
import { findWaiting } from "./waiting.js";
import { buildBriefing } from "./briefing.js";

const BATCH = 8;

export function replySubject(s) {
  return /^re:/i.test(s.trim()) ? s.trim() : `Re: ${s.trim()}`;
}

// A draft only ever goes back to the person who wrote to you (or their Reply-To). Never to anyone named in the email body.
export function buildDraft(email, body, me) {
  const to = email.replyTo || email.from;
  return buildRaw({
    from: me,
    to: [to],
    subject: replySubject(email.subject),
    text: body,
    inReplyTo: email.messageId || undefined,
    references: [email.references, email.messageId].filter(Boolean).join(" ") || undefined,
  });
}

export async function runPosta({ config, setup, gmail, linear, triage = triageBatch, now = new Date(), log = console.log }) {
  const prof = await gmail.profile();
  const me = { email: prof.emailAddress.toLowerCase(), name: config.myName };
  const today = now.toISOString().slice(0, 10);
  const teamKey = config.linearTeam || setup.role.linearTeam;
  const stats = { read: 0, skipped: 0, triaged: 0, tasks: 0, drafts: 0, errors: 0 };

  // 1. New email Posta hasn't handled yet.
  const ids = await gmail.listMessageIds(`${config.query} -label:${POSTA_LABEL} -from:me`, config.maxEmails);
  const emails = [];
  for (const { id } of ids) emails.push(normalizeMessage(await gmail.getMessage(id)));
  stats.read = emails.length;

  // 2. Newsletters and promotions are counted, never sent to Claude.
  const promo = emails.filter((e) => e.promotional);
  const toTriage = emails.filter((e) => !e.promotional);
  stats.skipped = promo.length;

  // 3. Triage in small batches.
  const items = [];
  const done = new Set(promo.map((e) => e.id));
  for (let i = 0; i < toTriage.length; i += BATCH) {
    const batch = toTriage.slice(i, i + BATCH);
    try {
      const results = await triage(batch, setup, me, today, { apiKey: config.anthropicKey, model: config.model });
      results.forEach((t, k) => items.push({ email: batch[k], triage: t, task: null, drafted: false }));
    } catch (err) {
      stats.errors++;
      log(`Triage failed for ${batch.length} emails, they'll be retried next run: ${err.message}`);
    }
  }
  stats.triaged = items.length;

  // 4. Act: tasks and drafts. Never sends anything except the briefing to you.
  for (const it of items) {
    try {
      if (it.triage.task && config.createTasks && teamKey) {
        const plan = planTask(it.email, it.triage, config);
        if (!config.dryRun) it.task = await createTask(plan, teamKey, linear);
        else it.task = { identifier: `${teamKey}-?`, url: "" };
        stats.tasks++;
      }
      if (it.triage.draft_reply && config.createDrafts) {
        if (!config.dryRun) await gmail.createDraft(buildDraft(it.email, it.triage.draft_reply, me), it.email.threadId);
        it.drafted = true;
        stats.drafts++;
      }
      done.add(it.email.id);
    } catch (err) {
      stats.errors++;
      log(`An email could not be fully handled and will be retried next run: ${err.message}`);
    }
  }

  // 5. Threads where you're waiting for a reply.
  let waiting = [];
  try {
    const sent = await gmail.listMessageIds("in:sent newer_than:14d", 60);
    const threadIds = [...new Set(sent.map((m) => m.threadId))];
    const threads = [];
    for (const t of threadIds) threads.push(await gmail.getThread(t));
    waiting = findWaiting(threads, me.email, { now, waitDays: config.waitDays });
  } catch (err) {
    log(`Could not check waiting threads: ${err.message}`);
  }

  // 6. The briefing, sent only to you.
  const briefing = buildBriefing({ me, items, waiting, skipped: promo.length, now, timezone: config.timezone });
  if (config.sendBriefing && !config.dryRun) {
    await gmail.sendRaw(buildRaw({ from: me, to: [me], subject: briefing.subject, text: briefing.text, html: briefing.html }));
  }

  // 7. Mark handled emails so tomorrow's run skips them. Failed ones stay unmarked and are retried.
  if (!config.dryRun && done.size) {
    const labelId = await gmail.ensureLabel(POSTA_LABEL);
    await gmail.addLabel([...done], labelId);
  }

  // Counts only. Never log email content: run logs on public repos are visible to anyone.
  log(`Read ${stats.read}, skipped ${stats.skipped}, triaged ${stats.triaged}: ${briefing.counts.needs} need you, ${stats.tasks} tasks, ${stats.drafts} drafts, ${waiting.length} waiting, ${stats.errors} errors${config.dryRun ? " (dry run: nothing created or sent)" : ""}.`);
  return { stats, briefing, items, waiting };
}
