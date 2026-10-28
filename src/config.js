// Reads settings from environment variables. See .env.example for what each one does.
import { readFileSync, existsSync } from "node:fs";

// Tiny .env loader so the project has zero dependencies.
export function loadDotEnv(path = ".env") {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    const [, key, raw] = m;
    if (process.env[key] === undefined) process.env[key] = raw.replace(/^["']|["']$/g, "");
  }
}

const bool = (v, dflt) => (v === undefined || v === "" ? dflt : v === "true");

export function getConfig(env = process.env) {
  return {
    google: {
      clientId: env.GOOGLE_CLIENT_ID || "",
      clientSecret: env.GOOGLE_CLIENT_SECRET || "",
      refreshToken: env.GOOGLE_REFRESH_TOKEN || "",
    },
    anthropicKey: env.ANTHROPIC_API_KEY || "",
    model: env.CLAUDE_MODEL || "claude-sonnet-5-5",
    linearKey: env.LINEAR_API_KEY || "",
    linearTeam: env.LINEAR_TEAM || "",
    playbook: env.POSTA_PLAYBOOK || "account-management",
    myName: env.POSTA_NAME || "",
    query: env.POSTA_QUERY || "in:inbox newer_than:2d",
    maxEmails: Number(env.POSTA_MAX_EMAILS || 50),
    waitDays: Number(env.WAIT_DAYS || 3),
    timezone: env.POSTA_TIMEZONE || "Europe/Lisbon",
    createTasks: bool(env.CREATE_TASKS, true),
    createDrafts: bool(env.CREATE_DRAFTS, true),
    sendBriefing: bool(env.SEND_BRIEFING, true),
    reviewMode: bool(env.REVIEW_MODE, false),
    minConfidence: Number(env.MIN_CONFIDENCE ?? 0.6),
    dryRun: bool(env.DRY_RUN, false),
    webhookSecret: env.POSTA_WEBHOOK_SECRET || "",
    port: Number(env.PORT || 8788),
    rootDir: new URL("../", import.meta.url).pathname,
  };
}
