// Vercel function for Zapier mode: https://<your-project>.vercel.app/api/email-webhook
import { getConfig } from "../src/config.js";
import { loadSetup } from "../src/playbooks.js";
import { handleWebhook } from "../src/webhook.js";

const config = getConfig();
const setup = loadSetup(config.rootDir, config.playbook);

export default async function handler(req, res) {
  const { status, body } = await handleWebhook({ method: req.method, headers: req.headers, body: req.body }, { config, setup });
  res.status(status).json(body);
}
