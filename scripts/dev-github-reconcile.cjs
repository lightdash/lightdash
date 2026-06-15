/* eslint-disable */
// Executable GitHub reconcile for the /docker-dev EE+github profile — replaces the
// hand-written crypto the flow used to require. Idempotent; safe to re-run.
//
// Reimplements the backend EncryptionUtil EXACTLY (aes-256-gcm, pbkdf2 sha512/2000/32,
// layout salt[64]|tag[16]|iv[12]|msg) and signs the GitHub App JWT with node crypto
// (no jsonwebtoken dep). Talks to Postgres via the backend's `pg` (resolved explicitly,
// since pnpm doesn't hoist it to repo root — see env-truth note in the skill).
//
// Steps (argv[2]):
//   installation   ensure github_app_installations has a row that DECRYPTS with the running
//                  secret AND points at a live installation (mint App JWT -> GET /app/installations
//                  -> pick account -> re-encrypt with running secret -> UPSERT -> verify).
//   org-settings   UPSERT ai_organization_settings (args like ai_agent_reviews_enabled=true).
//   dbt-repo-check report whether the org's project dbt_connection is github.
//   dbt-repo-repoint repoint the org's project dbt_connection at a GitHub repo so writeback
//                  can open PRs (args repo=owner/name branch=main subpath=/dbt). Verifies
//                  dbt_project.yml exists first; updates dbt_connection + dbt_connection_type.
//   verify-token   mint an installation access token (201) to prove the stored id works.
//
// Required env: RUNNING_SECRET (the pm2 api process LIGHTDASH_SECRET), GITHUB_APP_ID,
//   GITHUB_PRIVATE_KEY (base64 PEM), PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE.
// Optional env: ORG_UUID (default: first org), GH_ACCOUNT (default: prefer repos=all).

const crypto = require('crypto');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
function reqBackend(mod) {
  // pg isn't hoisted to repo root under pnpm; resolve from the backend package.
  try { return require(mod); } catch (_) {}
  return require(path.join(REPO_ROOT, 'packages/backend/node_modules', mod));
}
const { Client } = reqBackend('pg');

const SALT = 64, TAG = 16, IV = 12, ITER = 2000, KEYLEN = 32, DIGEST = 'sha512';

function need(name) {
  const v = process.env[name];
  if (!v) { console.error(`FAIL: reconcile -- missing env ${name}`); process.exit(1); }
  return v;
}

function encrypt(message, secret) {
  const iv = crypto.randomBytes(IV);
  const salt = crypto.randomBytes(SALT);
  const key = crypto.pbkdf2Sync(secret, salt, ITER, KEYLEN, DIGEST);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG });
  const enc = Buffer.concat([cipher.update(String(message), 'utf-8'), cipher.final()]);
  return Buffer.concat([salt, cipher.getAuthTag(), iv, enc]);
}
function decrypt(buf, secret) {
  const salt = buf.subarray(0, SALT);
  const tag = buf.subarray(SALT, SALT + TAG);
  const iv = buf.subarray(SALT + TAG, SALT + TAG + IV);
  const msg = buf.subarray(SALT + TAG + IV);
  const key = crypto.pbkdf2Sync(secret, salt, ITER, KEYLEN, DIGEST);
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG });
  d.setAuthTag(tag);
  return d.update(msg, undefined, 'utf-8') + d.final('utf-8');
}

function appJwt() {
  const appId = need('GITHUB_APP_ID');
  const pem = Buffer.from(need('GITHUB_PRIVATE_KEY'), 'base64').toString('utf-8');
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const data = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iat: now - 60, exp: now + 540, iss: String(appId) });
  const sig = crypto.createSign('RSA-SHA256').update(data).sign(pem, 'base64url');
  return data + '.' + sig;
}
async function gh(url, opts = {}) {
  const res = await fetch(`https://api.github.com${url}`, {
    ...opts,
    headers: { Authorization: `Bearer ${appJwt()}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) },
  });
  return res;
}

async function listInstallations() {
  const res = await gh('/app/installations');
  if (!res.ok) throw new Error(`GET /app/installations -> ${res.status}`);
  return res.json();
}
async function pickInstallation() {
  const list = await listInstallations();
  if (!list.length) throw new Error('App has no installations — install the dev GitHub App on your account first');
  const want = (process.env.GH_ACCOUNT || '').trim();
  if (want) {
    const chosen = list.find((i) => i.account && i.account.login === want);
    if (!chosen) {
      const accts = list.map((i) => i.account && i.account.login).filter(Boolean).join(', ');
      throw new Error(`GH_ACCOUNT='${want}' has no installation of this App. Available: ${accts}`);
    }
    return chosen;
  }
  // No account configured: the shared dev App has many installs, so guessing is unsafe.
  if (list.length === 1) return list[0];
  const accts = list.map((i) => `${i.account && i.account.login}(${i.repository_selection})`).join(', ');
  console.error(`WARN: GH_ACCOUNT not set and ${list.length} installations exist — guessing. Set githubAccount in ~/.lightdash/dev-secrets.local.json (or GH_ACCOUNT). Candidates: ${accts}`);
  return list.find((i) => i.repository_selection === 'all') || list[0];
}

async function orgUuid(client) {
  if (process.env.ORG_UUID) return process.env.ORG_UUID;
  const r = await client.query('SELECT organization_uuid FROM organizations ORDER BY organization_id LIMIT 1');
  if (!r.rows.length) throw new Error('no organizations in DB');
  return r.rows[0].organization_uuid;
}

async function stepInstallation(client) {
  const secret = need('RUNNING_SECRET');
  const org = await orgUuid(client);
  const live = await gh('/app/installations').then((r) => r.json());
  const liveIds = new Set((Array.isArray(live) ? live : []).map((i) => String(i.id)));

  const existing = await client.query(
    "SELECT encode(encrypted_installation_id,'hex') AS hex FROM github_app_installations WHERE organization_uuid=$1", [org]);
  if (existing.rows.length) {
    try {
      const cur = decrypt(Buffer.from(existing.rows[0].hex, 'hex'), secret);
      if (liveIds.has(String(cur))) {
        console.log(`OK: installation row already valid (id=${cur}, decrypts, live)`);
        return;
      }
      console.log(`reconcile: stored id ${cur} is stale (not a live installation) — refreshing`);
    } catch (_) {
      console.log('reconcile: stored installation id will not decrypt with the running secret — refreshing');
    }
  } else {
    console.log('reconcile: no installation row for this org — creating');
  }

  const inst = await pickInstallation();
  const id = String(inst.id);
  const enc = encrypt(id, secret);
  if (decrypt(enc, secret) !== id) throw new Error('round-trip check failed');

  if (existing.rows.length) {
    await client.query(
      'UPDATE github_app_installations SET encrypted_installation_id=$1, updated_at=now() WHERE organization_uuid=$2',
      [enc, org]);
  } else {
    const u = await client.query(
      "SELECT u.user_uuid FROM users u JOIN emails e ON e.user_id=u.user_id WHERE e.email='demo@lightdash.com' LIMIT 1");
    const userUuid = u.rows[0] && u.rows[0].user_uuid;
    if (!userUuid) throw new Error('demo user not found for created_by');
    // auth_token/refresh_token are varchar (NOT NULL) and only affect PR authorship,
    // never the token mint — a plain string placeholder is correct here. Binding an
    // encrypted Buffer would send binary bytes into a UTF8 text column and fail.
    const placeholder = 'placeholder';
    await client.query(
      `INSERT INTO github_app_installations
         (organization_uuid, encrypted_installation_id, auth_token, refresh_token,
          created_by_user_uuid, updated_by_user_uuid, created_at, updated_at)
       VALUES ($1,$2,$3,$3,$4,$4,now(),now())`,
      [org, enc, placeholder, userUuid]);
  }
  console.log(`OK: installation row set to id=${id} (account=${inst.account && inst.account.login}, repos=${inst.repository_selection})`);
}

async function stepOrgSettings(client, kvs) {
  const org = await orgUuid(client);
  const reviews = kvs.ai_agent_reviews_enabled === 'true';
  await client.query(
    `INSERT INTO ai_organization_settings (organization_uuid, ai_agents_visible, ai_agent_reviews_enabled)
     VALUES ($1, true, $2)
     ON CONFLICT (organization_uuid) DO UPDATE SET ai_agent_reviews_enabled=$2`,
    [org, reviews]);
  console.log(`OK: ai_organization_settings ai_agent_reviews_enabled=${reviews} for ${org}`);
}

async function stepDbtRepoCheck(client) {
  const secret = need('RUNNING_SECRET');
  const org = await orgUuid(client);
  const r = await client.query(
    `SELECT project_uuid, encode(dbt_connection,'hex') AS hex
       FROM projects WHERE organization_id=(SELECT organization_id FROM organizations WHERE organization_uuid=$1)
       ORDER BY project_id LIMIT 1`, [org]);
  if (!r.rows.length) { console.log('OK: no project to check'); return; }
  let type = '?';
  try { type = (JSON.parse(decrypt(Buffer.from(r.rows[0].hex, 'hex'), secret)).type) || '?'; } catch (_) {}
  if (type === 'github' || type === 'gitlab') {
    console.log(`OK: project ${r.rows[0].project_uuid} dbt_connection is '${type}' (writeback-capable)`);
  } else {
    console.log(`NEED: project ${r.rows[0].project_uuid} dbt_connection is '${type}', not github/gitlab — repoint it (guided: see the GitHub Integration section) for writeback to open PRs`);
  }
}

async function installationToken(client) {
  const secret = need('RUNNING_SECRET');
  const org = await orgUuid(client);
  const row = await client.query(
    "SELECT encode(encrypted_installation_id,'hex') AS hex FROM github_app_installations WHERE organization_uuid=$1", [org]);
  if (!row.rows.length) throw new Error('no installation row — run the installation step first');
  const id = decrypt(Buffer.from(row.rows[0].hex, 'hex'), secret);
  const res = await gh(`/app/installations/${id}/access_tokens`, { method: 'POST' });
  if (res.status !== 201) throw new Error(`mint installation token for id=${id} -> ${res.status}`);
  return { id, token: (await res.json()).token };
}

// Repoint the org's first project dbt_connection at a GitHub repo so AI writeback can
// open PRs. Verifies dbt_project.yml is reachable at repo/branch/subpath with the install
// token BEFORE writing, and preserves compiler-base fields (target/environment/selector).
async function stepDbtRepoRepoint(client, kvs) {
  const secret = need('RUNNING_SECRET');
  const org = await orgUuid(client);
  const repo = (kvs.repo || '').trim();
  const branch = (kvs.branch || 'main').trim();
  let subpath = (kvs.subpath || '/dbt').trim();
  if (!subpath.startsWith('/')) subpath = `/${subpath}`;
  if (!repo || repo.indexOf('/') < 0) throw new Error('repoint requires repo=owner/name');

  const { id, token } = await installationToken(client);

  const clean = subpath.replace(/^\/+|\/+$/g, '');
  const ymlPath = `${clean ? `${clean}/` : ''}dbt_project.yml`;
  const check = await fetch(`https://api.github.com/repos/${repo}/contents/${ymlPath}?ref=${encodeURIComponent(branch)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (check.status !== 200) throw new Error(`dbt_project.yml not found at ${repo}:${branch}/${ymlPath} (HTTP ${check.status}) — check repo/branch/subpath and that the App installation covers this repo`);

  const r = await client.query(
    `SELECT project_uuid, encode(dbt_connection,'hex') AS hex
       FROM projects WHERE organization_id=(SELECT organization_id FROM organizations WHERE organization_uuid=$1)
       ORDER BY project_id LIMIT 1`, [org]);
  if (!r.rows.length) throw new Error('no project to repoint');
  let cur = {};
  try { cur = JSON.parse(decrypt(Buffer.from(r.rows[0].hex, 'hex'), secret)); } catch (_) {}
  const next = {
    type: 'github',
    authorization_method: 'installation_id',
    installation_id: String(id),
    repository: repo,
    branch,
    project_sub_path: subpath,
  };
  if (cur.target) next.target = cur.target;
  if (cur.environment) next.environment = cur.environment;
  if (cur.selector) next.selector = cur.selector;
  if (cur.host_domain) next.host_domain = cur.host_domain;
  const enc = encrypt(JSON.stringify(next), secret);
  // Two columns hold the type: the encrypted dbt_connection blob AND the plaintext
  // dbt_connection_type that ProjectModel maintains and the writeback gate reads. Both
  // must change or proposeWriteback still sees 'dbt' and ParameterErrors.
  await client.query(
    'UPDATE projects SET dbt_connection=$1, dbt_connection_type=$2 WHERE project_uuid=$3',
    [enc, 'github', r.rows[0].project_uuid]);
  console.log(`OK: repointed project ${r.rows[0].project_uuid} dbt_connection -> github ${repo}@${branch}${subpath} (installation_id=${id})`);
}

async function stepVerifyToken(client) {
  const secret = need('RUNNING_SECRET');
  const org = await orgUuid(client);
  const row = await client.query(
    "SELECT encode(encrypted_installation_id,'hex') AS hex FROM github_app_installations WHERE organization_uuid=$1", [org]);
  if (!row.rows.length) throw new Error('no installation row');
  const id = decrypt(Buffer.from(row.rows[0].hex, 'hex'), secret);
  const res = await gh(`/app/installations/${id}/access_tokens`, { method: 'POST' });
  if (res.status === 201) console.log(`OK: installation token mints (id=${id}, HTTP 201)`);
  else { console.error(`FAIL: verify-token -- POST access_tokens for id=${id} -> ${res.status}`); process.exit(1); }
}

// A shared base snapshot bakes in the *creating* instance's warehouse host/port, so a
// bootstrapped instance points its local-postgres warehouse at a dead port and every
// query fails with "Unknown object error". Re-point local warehouse credentials at this
// instance's PG port (PGPORT) and re-encrypt with the running secret. Only touches
// postgres credentials whose host is clearly local, so a real external warehouse is left
// alone.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', 'host.docker.internal', 'postgres', 'db', 'db-dev']);
async function stepWarehousePortFix(client) {
  const secret = need('RUNNING_SECRET');
  const targetPort = parseInt(process.env.PGPORT || '5432', 10);
  const rows = await client.query(
    "SELECT warehouse_credentials_id, warehouse_type, encode(encrypted_credentials,'hex') AS hex FROM warehouse_credentials");
  if (!rows.rows.length) { console.log('OK: no warehouse_credentials rows'); return; }
  let fixed = 0;
  for (const row of rows.rows) {
    if (row.warehouse_type !== 'postgres') continue;
    let creds;
    try { creds = JSON.parse(decrypt(Buffer.from(row.hex, 'hex'), secret)); }
    catch (_) { console.log(`WARN: warehouse_credentials_id=${row.warehouse_credentials_id} will not decrypt with running secret — skipping`); continue; }
    if (!LOCAL_HOSTS.has(String(creds.host))) {
      console.log(`SKIP: warehouse_credentials_id=${row.warehouse_credentials_id} host=${creds.host} is not local — leaving as-is`);
      continue;
    }
    if (creds.host === 'localhost' && creds.port === targetPort) continue;
    const before = `${creds.host}:${creds.port}`;
    creds.host = 'localhost';
    creds.port = targetPort;
    const enc = encrypt(JSON.stringify(creds), secret);
    if (decrypt(enc, secret) !== JSON.stringify(creds)) throw new Error('round-trip check failed');
    await client.query(
      'UPDATE warehouse_credentials SET encrypted_credentials=$1 WHERE warehouse_credentials_id=$2',
      [enc, row.warehouse_credentials_id]);
    console.log(`OK: warehouse_credentials_id=${row.warehouse_credentials_id} repointed ${before} -> localhost:${targetPort}`);
    fixed += 1;
  }
  if (!fixed) console.log(`OK: warehouse credentials already point at localhost:${targetPort}`);
}

(async () => {
  const step = process.argv[2];
  const kvs = {};
  for (const a of process.argv.slice(3)) { const i = a.indexOf('='); if (i > 0) kvs[a.slice(0, i)] = a.slice(i + 1); }
  const client = new Client({
    host: process.env.PGHOST || 'localhost', port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || 'postgres', password: process.env.PGPASSWORD || 'password',
    database: process.env.PGDATABASE || 'postgres',
  });
  await client.connect();
  try {
    if (step === 'list-accounts') {
      const list = await listInstallations();
      console.log(JSON.stringify(list.map((i) => ({ login: i.account && i.account.login, repos: i.repository_selection })), null, 2));
    }
    else if (step === 'installation') await stepInstallation(client);
    else if (step === 'org-settings') await stepOrgSettings(client, kvs);
    else if (step === 'dbt-repo-check') await stepDbtRepoCheck(client);
    else if (step === 'dbt-repo-repoint') await stepDbtRepoRepoint(client, kvs);
    else if (step === 'verify-token') await stepVerifyToken(client);
    else if (step === 'warehouse-port-fix') await stepWarehousePortFix(client);
    else { console.error(`FAIL: reconcile -- unknown step '${step}'`); process.exit(2); }
  } finally {
    await client.end();
  }
})().catch((e) => { console.error(`FAIL: reconcile -- ${e.message}`); process.exit(1); });
