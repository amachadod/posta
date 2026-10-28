# Posta

**Your inbox, read before you are.**

Every morning Posta reads your new email, tells you what needs you, turns real work into Linear tasks and drafts your replies in Gmail. **It never sends anything for you.** The only email it sends is your morning briefing, to your own address.

Built for anyone with an inbox: account managers, sales, marketing, customer success. Your job is described in a plain-English playbook, and drafts follow a short file describing how you write.

👉 **[See the live demo](https://amachadod.github.io/posta/)**: a fictional account manager's inbox, the briefing Posta builds from it, and what it did with each email.

*Portfolio project by Alberto Machado Domínguez. The people and companies in the examples are fictional.*

---

## What you get each morning

An email to yourself, before work starts:

- **Needs you:** client requests, approvals, deadlines, broken campaigns, meeting changes. Sorted by urgency, each with its due date, a link to the email, the Linear task and whether a draft is ready.
- **Be careful:** phishing, fake bank-detail changes, or emails that try to give instructions to an AI. Posta takes no action on these.
- **Waiting on others:** threads where you sent the last message and nobody has replied for a few days.
- **Worth knowing:** updates with nothing to do, in one line each.
- **Skipped:** newsletters and notifications, counted but not shown.

Plus:
- **Linear tasks** for real work, with the email quoted as evidence and a link back to it.
- **Draft replies** in your Gmail drafts, in the same thread, written in your voice. You edit and send them yourself.

## How it works

```
 Gmail ──▶ 1. read new email ──▶ 2. skip newsletters ──▶ 3. Claude triages ──▶ 4. act ──────────▶ 5. brief
           (not yet labelled       (Gmail categories,      (your playbooks,        Linear tasks       one email
            "Posta")                no AI involved)         your voice)             Gmail drafts       to you
```

1. **Read.** GitHub runs Posta every weekday morning. It reads new email in your inbox that it hasn't handled before.
2. **Skip.** Promotions, social notifications and bulk mail are counted and skipped before any AI sees them.
3. **Triage.** Claude reads the rest in small batches, using `playbooks/everyone.md`, your role's playbook and `voice.md`, and returns structured data for each email: category, one-line headline, deadline, task, draft reply, and whether it looks suspicious.
4. **Act.** Posta checks Claude's answer (see Safeguards), then creates the Linear tasks and saves the drafts.
5. **Brief.** It sends you the briefing and labels the handled emails "Posta", so they're skipped tomorrow. Emails that failed stay unlabelled and are retried.

"Waiting on others" doesn't use AI: it's worked out from the dates and senders of your sent threads.

## Playbooks and your voice

| File | What it's for |
|---|---|
| [`playbooks/everyone.md`](playbooks/everyone.md) | Rules for any job: what needs you, what's just fyi, when to draft, what's suspicious. Always used. |
| [`playbooks/account-management.md`](playbooks/account-management.md) | Client requests, deadlines, approvals, suppliers, risk signals |
| [`playbooks/sales.md`](playbooks/sales.md) | Prospect replies, buying signals, contracts, objections |
| [`playbooks/marketing.md`](playbooks/marketing.md) | Ad platform alerts, agency and freelancer deliveries, budget changes |
| [`playbooks/customer-success.md`](playbooks/customer-success.md) | Customer problems, churn signals, renewals, feature requests |
| [`voice.md`](voice.md) | How you write, so drafts sound like you |

Choose yours with `POSTA_PLAYBOOK` (for example `sales`). For another role, copy [`playbooks/_template.md`](playbooks/_template.md) and describe your job in plain English.

## Safeguards

Claude's answer is checked before anything happens:

- **Never sends for you.** Replies are drafts. The only email sent is the briefing, from you to you.
- **Email is untrusted.** The prompt treats every email as data, never instructions. Emails marked suspicious get no task and no draft, even if Claude suggested one.
- **Drafts only to the person who wrote to you** (or their Reply-To), in the same thread. Never to anyone else named in the email, and never to automated senders.
- **Tasks are for you.** They're assigned to the owner of the Linear key, unless Claude was less than 60% sure: then they're unassigned and labelled "Needs review".
- **No duplicates.** Each task carries a reference to its email, and Posta checks Linear before creating one.
- **Nothing stored, nothing logged.** Posta keeps no database. Logs contain counts only, never email content.
- **Least access.** Gmail access uses the `gmail.modify` permission: read, label, draft and send. It can't permanently delete anything.

## Try it without any accounts

You need [Node.js 20+](https://nodejs.org). There are no dependencies to install.

```bash
git clone https://github.com/amachadod/posta.git
cd posta
npm run demo   # runs the example inbox through Posta; prints the briefing and saves briefing-preview.html
npm test       # 18 tests: parsing, safeguards, drafts, waiting threads, dry run, retries, webhook, Gmail sign-in
```

## Which setup is right for you?

| | **GitHub schedule** (recommended) | **Zapier** |
|---|---|---|
| Email | Gmail | Gmail or Outlook |
| When | Every weekday morning | As each email arrives |
| Morning briefing | Yes | No (tasks and drafts only) |
| Cost | Free (GitHub Actions) + Claude usage | Zapier plan + a server + Claude usage |
| Setup | One-time Google setup, about 15 minutes | Sign in with Google or Microsoft in Zapier |

### Option A: GitHub schedule (Gmail)

**1. Make a private copy.** Click **Use this template → Create a new repository** and choose **Private**. Posta never logs email content, but run logs of public repositories are visible to anyone, so your real inbox should always run from a private copy.

**2. Connect Gmail (once).** In the [Google Cloud console](https://console.cloud.google.com):
1. Create a project, for example "Posta".
2. **APIs & Services → Library**: enable the **Gmail API**.
3. **OAuth consent screen**: choose **External** (or **Internal** on a Google Workspace account), fill in the app name and your email, and add yourself as a test user.
4. **Credentials → Create credentials → OAuth client ID → Desktop app**. Copy the client ID and client secret.
5. On your computer, in your copy of the repo: copy `.env.example` to `.env`, paste `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then run `npm run authorize`. Open the link, allow access, and copy the refresh token it prints.

> **Important:** while a Google app is in "Testing", its refresh tokens expire after 7 days. To keep Posta working, go back to the OAuth consent screen and click **Publish app**. Google will show an "unverified app" warning when you authorize; that's expected for an app only you use. Click **Advanced → Go to Posta**. Workspace accounts with an Internal app don't have this limit.

**3. Add secrets and variables.** In your private copy: **Settings → Secrets and variables → Actions**.
- **Secrets:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `ANTHROPIC_API_KEY`, `LINEAR_API_KEY`
- **Variables:** `POSTA_ENABLED` = `true`, `POSTA_NAME` = your name, `POSTA_PLAYBOOK` = your role. Optional: `LINEAR_TEAM`, `POSTA_TIMEZONE`, `POSTA_QUERY`, `DRY_RUN` = `true` for the first runs, `CREATE_TASKS` = `false` if you don't use Linear.

**4. Test it.** **Actions → Posta morning briefing → Run workflow**. With `DRY_RUN` on, nothing is created or sent and the log shows the counts. Turn it off when you're happy. Running it locally with `DRY_RUN=true npm run briefing` saves `briefing-preview.html` so you can see the briefing.

**5. Pick your time.** The schedule in [`.github/workflows/posta-daily.yml`](.github/workflows/posta-daily.yml) is in UTC (`40 6 * * 1-5`: 06:40 UTC on weekdays). GitHub may start it a few minutes late.

### Option B: Zapier (Gmail or Outlook)

Posta handles each email as it arrives and gives Zapier the draft to save. There's no morning briefing in this mode.

1. **Deploy the webhook.** Import the repo into Vercel and add `ANTHROPIC_API_KEY`, `LINEAR_API_KEY`, `POSTA_WEBHOOK_SECRET`, `POSTA_PLAYBOOK` and `POSTA_NAME`. Your webhook is `https://<project>.vercel.app/api/email-webhook`. (Or run `npm start` and use a tunnel.)
2. **Zap step 1, trigger:** Gmail "New Email" or Outlook "New Email".
3. **Zap step 2, Webhooks by Zapier → POST** to your webhook, header `x-posta-secret: <your secret>`, JSON fields: `message_id`, `thread_id`, `from`, `from_name`, `to`, `cc`, `subject`, `body_plain`, `date`.
4. **Zap step 3, Filter:** continue only if `create_draft` is true.
5. **Zap step 4, Gmail/Outlook "Create Draft" (reply):** To = `draft_to`, Subject = `draft_subject`, Body = `draft_body`, Thread = `thread_id`.

## Costs

- **GitHub Actions:** free for this (one short run a day).
- **Claude:** pay per use. Emails go in batches of eight and newsletters are skipped before Claude sees them, so a normal inbox costs a few cents a day.
- **Linear:** the free plan works.
- **Zapier mode only:** a Zapier plan that includes webhooks, plus a free Vercel account.

## Project structure

```
src/
  gmail.js       Gmail API: sign-in with a refresh token, read, label, drafts, send
  mime.js        reading and building email messages (no dependencies)
  claude.js      triage prompt, structured output and validation
  linear.js      tasks: what they look like, duplicates check, Linear API
  waiting.js     "waiting on others" from sent threads
  briefing.js    the briefing email (HTML + plain text)
  run.js         the morning run, step by step
  webhook.js     Zapier mode
scripts/         run.js (daily run), authorize.js (connect Gmail), demo, build-demo
playbooks/       one file per role, plus everyone.md
voice.md         how you write
examples/        the fictional inbox and example Claude output used by the demo and tests
.github/         the weekday schedule
docs/            the demo page (GitHub Pages)
test/            node:test suite
```

## Limitations

- The demo uses example output written for a fictional inbox. It doesn't call Claude live, because a public page can't hold an API key.
- The GitHub mode is Gmail only. Outlook works through Zapier, without the briefing.
- Posta reads the last two days by default (`POSTA_QUERY`). Longer gaps, such as after a holiday, need a wider query for one run.
- Triage is only as good as the email: when something is unclear, Posta says so in the headline instead of guessing.

## Tech

Node.js 20+, no dependencies. Gmail API with OAuth 2.0 (PKCE), Claude Messages API with forced tool use, Linear GraphQL API, GitHub Actions, optional Zapier webhooks, GitHub Pages for the demo.

## Part of a small set of tools

- [**Plano**](https://github.com/amachadod/plano): paid media budget forecaster
- [**Minuta**](https://github.com/amachadod/minuta): turns calls into tasks for the right team
- **Posta**: turns email into a morning briefing, tasks and drafts

## License

MIT. Gmail, Claude, Linear and Zapier are trademarks of their respective owners. Posta is an independent project and is not affiliated with them.
