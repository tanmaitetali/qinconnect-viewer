// Copies a shared environment config into the frontend's public/ folder as
// config.json. The app fetches /config.json at runtime. Same pattern as
// ivr-tester/frontend/scripts/generate-config.mjs.
//
// Usage: node scripts/generate-config.mjs <env>   (defaults to "local")

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = process.argv[2] || 'local';

const sourcePath = resolve(__dirname, '..', '..', 'config', `${env}.json`);
const outDir = resolve(__dirname, '..', 'public');
const outPath = resolve(outDir, 'config.json');

let raw;
try {
  raw = readFileSync(sourcePath, 'utf8');
} catch {
  console.error(`[generate-config] Could not read ${sourcePath}`);
  console.error(`[generate-config] Available envs live in the repo root /config folder.`);
  process.exit(1);
}

const full = JSON.parse(raw);

// This app has no backend and no account-specific secrets beyond the app
// client id (which is meant to be public — Cognito app clients are not
// confidential). account/region are CDK-only.
const publicConfig = {
  env: full.env,
  appName: full.appName,
  auth: full.auth,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, JSON.stringify(publicConfig, null, 2) + '\n');

console.log(`[generate-config] Wrote ${outPath} from config/${env}.json.`);
