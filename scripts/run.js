// npm run briefing  (or: node scripts/run.js)
// The daily run. GitHub Actions calls this every weekday morning (.github/workflows/posta-daily.yml).
import { writeFileSync } from "node:fs";
import { loadDotEnv, getConfig } from "../src/config.js";
import { loadSetup } from "../src/playbooks.js";
import { createGmailClient } from "../src/gmail.js";
import { createLinearClient } from "../src/linear.js";
import { runPosta } from "../src/run.js";

loadDotEnv();
const config = getConfig();

try {
  const setup = loadSetup(config.rootDir, config.playbook);
  const gmail = createGmailClient(config.google);
  const linear = config.createTasks && !config.dryRun ? createLinearClient({ apiKey: config.linearKey }) : null;
  const { briefing, stats } = await runPosta({ config, setup, gmail, linear });
  // Dry run on your own computer: save the briefing so you can open it. Never in CI, where files could end up public.
  if (config.dryRun && !process.env.CI) {
    writeFileSync("briefing-preview.html", briefing.html);
    console.log("Saved briefing-preview.html. Open it in your browser.");
  }
  if (stats.errors) process.exitCode = 1;
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
