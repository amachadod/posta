// npm run authorize
// One-time Gmail connection. Opens Google's consent screen, then prints the refresh token
// Posta needs. Run it on your own computer, with GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.
import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { loadDotEnv } from "../src/config.js";

loadDotEnv();
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env first (README: Connect Gmail, step 1).");
  process.exit(1);
}

const PORT = 53682;
const redirectUri = `http://127.0.0.1:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/gmail.modify";
const b64url = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const verifier = b64url(randomBytes(32));
const state = b64url(randomBytes(16));

const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
url.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: "code",
  scope: SCOPE,
  access_type: "offline",
  prompt: "consent",
  state,
  code_challenge: b64url(createHash("sha256").update(verifier).digest()),
  code_challenge_method: "S256",
}).toString();

const server = createServer(async (req, res) => {
  const q = new URL(req.url, redirectUri).searchParams;
  if (!q.get("code") && !q.get("error")) { res.writeHead(404); return res.end(); }
  const finish = (msg) => { res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }); res.end(msg); server.close(); };
  if (q.get("error") || q.get("state") !== state) return finish("Authorization was cancelled or didn't match. Run npm run authorize again.");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: q.get("code"), client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier }).toString(),
  });
  const data = await r.json();
  if (!data.refresh_token) {
    console.error("Google did not return a refresh token:", data.error_description || data.error || "unknown error");
    return finish("Something went wrong. Check the terminal.");
  }
  console.log("\nConnected. Your refresh token:\n\n" + data.refresh_token + "\n");
  console.log("Save it as GOOGLE_REFRESH_TOKEN in .env (local) or as a GitHub Actions secret. Treat it like a password.");
  finish("Posta is connected to Gmail. You can close this tab and go back to the terminal.");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("Open this link in your browser and allow access:\n\n" + url.toString() + "\n");
  console.log("If Google says the app isn't verified: Advanced → Go to (your app). It's your own app, only you use it.");
});
