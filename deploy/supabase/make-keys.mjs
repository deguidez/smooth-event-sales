// Gera os segredos do Supabase auto-hospedado e escreve no arquivo .env.
//
//   node deploy/supabase/make-keys.mjs https://evenon.com.br
//
// Precisa rodar DENTRO da pasta do Supabase docker (a que tem o arquivo .env),
// ou apontar ENV_FILE para ela.
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const siteUrl = process.argv[2] || "https://evenon.com.br";
const envPath = process.env.ENV_FILE || "./.env";

if (!existsSync(envPath)) {
  console.error(`Arquivo .env não encontrado em ${envPath}`);
  process.exit(1);
}

const b64url = (input) => Buffer.from(input).toString("base64url");

/** Assina um token de acesso no formato que o Supabase espera (HS256). */
function accessToken(secret, role, iat, exp) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ role, iss: "supabase", iat, exp }));
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

const now = Math.floor(Date.now() / 1000);
const tenYears = now + 10 * 365 * 24 * 60 * 60;

const jwtSecret = randomBytes(32).toString("base64url");
const values = {
  SITE_URL: siteUrl,
  API_EXTERNAL_URL: siteUrl,
  SUPABASE_PUBLIC_URL: siteUrl,
  POSTGRES_PASSWORD: randomBytes(24).toString("base64url"),
  JWT_SECRET: jwtSecret,
  ANON_KEY: accessToken(jwtSecret, "anon", now, tenYears),
  SERVICE_ROLE_KEY: accessToken(jwtSecret, "service_role", now, tenYears),
  VAULT_ENC_KEY: randomBytes(16).toString("hex"),
  DASHBOARD_USERNAME: "evenon-admin",
  DASHBOARD_PASSWORD: randomBytes(18).toString("base64url"),
};

let text = readFileSync(envPath, "utf8");
const applied = [];
for (const [key, value] of Object.entries(values)) {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(text)) {
    text = text.replace(pattern, `${key}=${value}`);
    applied.push(key);
  } else {
    text += `\n${key}=${value}`;
    applied.push(`${key} (novo)`);
  }
}

writeFileSync(envPath, text, { mode: 0o600 });
console.log("Segredos gravados em", envPath);
console.log("Preenchidos:", applied.join(", "));
console.log(
  "\nGuarde o DASHBOARD_PASSWORD (painel de administração do banco). Ele não aparece de novo.",
);
