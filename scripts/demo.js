// npm run demo
// Runs Posta on the example inbox with fake Gmail, Claude and Linear. No accounts or API keys needed.
import { writeFileSync } from "node:fs";
import { getConfig } from "../src/config.js";
import { loadSetup } from "../src/playbooks.js";
import { runPosta } from "../src/run.js";
import { loadExample, fakeGmail, fakeTriage, fakeLinear } from "./examples.js";

const { inbox, triage } = loadExample();
const config = { ...getConfig({}), myName: inbox.me.name, playbook: inbox.playbook };
const setup = loadSetup(config.rootDir, config.playbook);
const gmail = fakeGmail(inbox);
const linear = fakeLinear();

const { briefing, items } = await runPosta({ config, setup, gmail, linear, triage: fakeTriage(triage), now: new Date(inbox.now) });

console.log(`\n${briefing.subject}\n${"─".repeat(briefing.subject.length)}\n`);
console.log(briefing.text);
console.log(`\nLinear tasks created: ${linear.created.length} · Gmail drafts: ${gmail.calls.drafts.length} · Briefings sent to you: ${gmail.calls.sent.length}`);
console.log(`Suspicious emails acted on: ${items.filter((i) => i.triage.suspicious && (i.task || i.drafted)).length}`);
writeFileSync("briefing-preview.html", briefing.html);
console.log("Saved briefing-preview.html. Open it in your browser to see the email.");
