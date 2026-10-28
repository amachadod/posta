// Playbooks are plain Markdown files in /playbooks. "everyone.md" holds rules for any job;
// your role's playbook (POSTA_PLAYBOOK) adds what matters for your work. Same format as Minuta.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export function parsePlaybook(text, file = "playbook.md") {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing the --- header block at the top.`);
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^\s*([a-z_]+)\s*:\s*(.*)$/i);
    if (kv) meta[kv[1].toLowerCase()] = kv[2].trim();
  }
  if (!meta.team) throw new Error(`${file}: the header needs a "team:" line.`);
  return { team: meta.team, linearTeam: meta.linear_team || "", description: meta.description || "", instructions: m[2].trim() };
}

export function loadSetup(rootDir, playbookId) {
  const dir = join(rootDir, "playbooks");
  const read = (f) => readFileSync(join(dir, f), "utf8");
  const file = `${playbookId}.md`;
  if (!existsSync(join(dir, file))) throw new Error(`No playbook called "${playbookId}". Check POSTA_PLAYBOOK; files live in /playbooks.`);
  const voicePath = join(rootDir, "voice.md");
  return {
    base: parsePlaybook(read("everyone.md"), "everyone.md"),
    role: { id: playbookId, ...parsePlaybook(read(file), file) },
    voice: existsSync(voicePath) ? readFileSync(voicePath, "utf8").trim() : "",
  };
}
