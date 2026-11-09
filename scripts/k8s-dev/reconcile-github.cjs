// Write a GitHub App installation straight into github_app_installations for the k8s
// deployment, encrypted with the running LIGHTDASH_SECRET. Mirrors the backend EncryptionUtil
// EXACTLY (aes-256-gcm, pbkdf2 sha512/2000/32, layout salt[64]|tag[16]|iv[12]|msg) — same as
// scripts/dev-github-reconcile.cjs — but uses the real first user (no seeded demo).
const crypto = require('crypto');
const { Client } = require('pg');

const SALT = 64, TAG = 16, IV = 12, ITER = 2000, KEYLEN = 32, DIGEST = 'sha512';

function encrypt(message, secret) {
  const iv = crypto.randomBytes(IV);
  const salt = crypto.randomBytes(SALT);
  const key = crypto.pbkdf2Sync(secret, salt, ITER, KEYLEN, DIGEST);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG });
  const enc = Buffer.concat([cipher.update(String(message), 'utf8'), cipher.final()]);
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
  return Buffer.concat([d.update(msg), d.final()]).toString('utf8');
}

(async () => {
  const secret = process.env.RUNNING_SECRET;
  const instId = process.env.INSTALLATION_ID;
  if (!secret || !instId) throw new Error('need RUNNING_SECRET + INSTALLATION_ID');

  const client = new Client({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5433', 10),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  });
  await client.connect();

  // Show NOT NULL columns so a schema drift is visible rather than a cryptic insert error.
  const cols = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name='github_app_installations' AND is_nullable='NO' ORDER BY ordinal_position`);
  console.log('NOT NULL cols:', cols.rows.map((r) => r.column_name).join(', '));

  const org = (await client.query(
    'SELECT organization_uuid FROM organizations ORDER BY organization_id LIMIT 1')).rows[0]?.organization_uuid;
  if (!org) throw new Error('no organizations in DB');
  const user = (await client.query(
    'SELECT u.user_uuid FROM users u JOIN emails e ON e.user_id=u.user_id ORDER BY u.user_id LIMIT 1')).rows[0]?.user_uuid;
  if (!user) throw new Error('no users in DB');

  const enc = encrypt(instId, secret);
  if (decrypt(enc, secret) !== String(instId)) throw new Error('encrypt/decrypt roundtrip failed');

  const exists = (await client.query(
    'SELECT 1 FROM github_app_installations WHERE organization_uuid=$1', [org])).rows.length;
  if (exists) {
    await client.query(
      'UPDATE github_app_installations SET encrypted_installation_id=$1, updated_at=now(), updated_by_user_uuid=$3 WHERE organization_uuid=$2',
      [enc, org, user]);
    console.log('UPDATED installation row');
  } else {
    await client.query(
      `INSERT INTO github_app_installations
         (organization_uuid, encrypted_installation_id, auth_token, refresh_token,
          created_by_user_uuid, updated_by_user_uuid, created_at, updated_at)
       VALUES ($1,$2,'placeholder','placeholder',$3,$3,now(),now())`,
      [org, enc, user]);
    console.log('INSERTED installation row');
  }

  // Verify it reads back + decrypts.
  const back = (await client.query(
    "SELECT encrypted_installation_id AS e FROM github_app_installations WHERE organization_uuid=$1", [org])).rows[0].e;
  console.log('verify decrypt ->', decrypt(back, secret), '(org=' + org + ', user=' + user + ')');
  await client.end();
  console.log('DONE');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
