// Zapier mode, local server: npm start
// Point a Zapier "Webhooks by Zapier → POST" step at http://<your-host>:8788/webhook/email
import { createServer } from "node:http";
import { loadDotEnv, getConfig } from "./src/config.js";
import { loadSetup } from "./src/playbooks.js";
import { handleWebhook } from "./src/webhook.js";

loadDotEnv();
const config = getConfig();
const setup = loadSetup(config.rootDir, config.playbook);

createServer(async (req, res) => {
  const send = (status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body, null, 2)); };
  if (req.url === "/health") return send(200, { ok: true, playbook: setup.role.team });
  if (req.url !== "/webhook/email") return send(404, { error: "Not found. Use POST /webhook/email" });
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > 2_000_000) return send(413, { error: "Body too large." }); }
  const { status, body } = await handleWebhook({ method: req.method, headers: req.headers, body: raw }, { config, setup });
  send(status, body);
}).listen(config.port, () => console.log(`Posta (Zapier mode) listening on http://localhost:${config.port}/webhook/email`));
