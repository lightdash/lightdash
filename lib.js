// Runs inside a Rainbow guest. Never prints or saves the Google token.
const { execSync } = require('child_process');
const fs = require('fs');

const PAT = 'ldpat_deadbeefdeadbeefdeadbeefdeadbeef';
const API = 'http://localhost:8080';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const OUT = '/tmp/gtf/out';
fs.mkdirSync(OUT, { recursive: true });
const PROJECT = '3675b69e-8324-4110-bdca-059031aa8da3';

const pgEnv = (() => {
    for (const pid of fs.readdirSync('/proc').filter((p) => /^\d+$/.test(p))) {
        try {
            const env = fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0');
            if (env.some((kv) => kv.startsWith('PGPASSWORD='))) {
                return Object.fromEntries(
                    env
                        .filter((kv) => /^PG(HOST|PORT|USER|DATABASE|PASSWORD)=/.test(kv))
                        .map((kv) => [kv.split('=')[0], kv.slice(kv.indexOf('=') + 1)]),
                );
            }
        } catch (e) {}
    }
    return {};
})();
const psql = (sql) =>
    execSync(`psql -tAc ${JSON.stringify(sql)}`, { env: { ...process.env, ...pgEnv } }).toString().trim();

const ld = async (method, path, body) => {
    const res = await fetch(API + path, {
        method,
        headers: { Authorization: `ApiKey ${PAT}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (json.status !== 'ok') throw new Error(`${method} ${path}: ${JSON.stringify(json.error ?? json).slice(0, 500)}`);
    return json.results;
};
let tokenCache;
const token = async () => {
    if (tokenCache && Date.now() - tokenCache.at < 120_000) return tokenCache.value;
    tokenCache = { value: await ld('GET', '/api/v1/gdrive/get-access-token'), at: Date.now() };
    return tokenCache.value;
};
const gs = async (method, url, body) => {
    const res = await fetch(url.startsWith('http') ? url : SHEETS + url, {
        method,
        headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    return json;
};
const batch = async (sid, requests) => gs('POST', `/${sid}:batchUpdate`, { requests });
// Same as gs, but also returns the HTTP status.
const gsx = async (method, url, body) => {
    const res = await fetch(url.startsWith('http') ? url : SHEETS + url, {
        method,
        headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch (e) { json = { raw: text.slice(0, 500) }; }
    return { status: res.status, json };
};
const batchx = async (sid, requests) => {
    const r = await gsx('POST', `/${sid}:batchUpdate`, { requests });
    return { status: r.status, error: r.json.error ? { code: r.json.error.code, status: r.json.error.status, message: r.json.error.message } : undefined, json: r.json };
};
const q = (t) => encodeURIComponent(t);
const qt = (t) => `'${t.replaceAll("'", "''")}'`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tabs = async (sid) =>
    ((await gs('GET', `/${sid}?fields=sheets(properties(sheetId,title,index,hidden,gridProperties),basicFilter)`)).sheets ?? []).map(
        (s) => ({
            title: s.properties.title,
            sheetId: s.properties.sheetId,
            index: s.properties.index,
            hidden: !!s.properties.hidden,
            grid: `${s.properties.gridProperties.rowCount}x${s.properties.gridProperties.columnCount}`,
            frozen: s.properties.gridProperties.frozenRowCount ?? 0,
            basicFilter: s.basicFilter ?? null,
        }),
    );
const values = async (sid, range, render = 'UNFORMATTED_VALUE') =>
    (await gs('GET', `/${sid}/values/${q(range)}?valueRenderOption=${render}`)).values ?? [];

const createSheet = async (title, extraTabs = []) => {
    const ss = await gs('POST', '', {
        properties: { title },
        sheets: [{ properties: { title: 'Sheet1' } }, ...extraTabs.map((t) => ({ properties: { title: t } }))],
    });
    if (!ss.spreadsheetId) throw new Error(`sheet create failed: ${JSON.stringify(ss.error)}`);
    return ss.spreadsheetId;
};

const createSqlChart = async (name, sql, limit) => {
    const SPACE = (await ld('GET', `/api/v1/projects/${PROJECT}/spaces`))[0].uuid;
    const chart = await ld('POST', `/api/v1/projects/${PROJECT}/sqlRunner/saved`, {
        name,
        description: null,
        sql,
        limit,
        config: { metadata: { version: 1 }, type: 'table', columns: {}, display: {} },
        spaceUuid: SPACE,
    });
    return chart.savedSqlUuid;
};

const createScheduler = async (path, { name, sid, tabName, showFilters }) => {
    const sched = await ld('POST', path, {
        name,
        cron: '0 9 * * 1',
        format: 'gsheets',
        enabled: true,
        targets: [],
        includeLinks: false,
        plainTextEmail: false,
        useCachedResults: false,
        appUuid: null,
        appName: null,
        options: {
            gdriveId: sid,
            gdriveName: name,
            gdriveOrganizationName: '',
            url: `https://docs.google.com/spreadsheets/d/${sid}/edit`,
            ...(tabName ? { tabName } : {}),
            ...(showFilters ? { showFilters: true } : {}),
        },
    });
    return sched.schedulerUuid;
};

// Send now and wait for this run's final uploadGsheets status.
const sendAndWait = async (su, { waitSec = 1500, label } = {}) => {
    await ld('PATCH', `/api/v1/schedulers/${su}/enabled`, { enabled: true }).catch(() => {});
    const startedAt = Date.now();
    const since = new Date(startedAt - 2000).toISOString();
    const sent = await ld('POST', `/api/v1/schedulers/${su}/send`);
    if (label) fs.appendFileSync(`${OUT}/${label}.log`, `${new Date().toISOString()} sent job ${sent.jobId} scheduler ${su}\n`);
    let final = '';
    for (let i = 0; i < waitSec / 3; i += 1) {
        await sleep(3000);
        final = psql(
            `select status from scheduler_log where scheduler_uuid='${su}' and task='uploadGsheets' and status in ('completed','error') and created_at > '${since}' order by created_at desc limit 1`,
        );
        if (final) break;
    }
    const durationSec = Math.round((Date.now() - startedAt) / 100) / 10;
    const log = JSON.parse(
        psql(
            `select coalesce(json_agg(json_build_object('status',status,'at',created_at,'error',details->>'error') order by created_at),'[]') from scheduler_log where scheduler_uuid='${su}' and task='uploadGsheets' and created_at > '${since}'`,
        ),
    );
    const enabledAfter = (await ld('GET', `/api/v1/schedulers/${su}`)).enabled;
    await ld('PATCH', `/api/v1/schedulers/${su}/enabled`, { enabled: false }).catch(() => {});
    return { jobId: sent.jobId, final, durationSec, enabledAfter, log, since };
};

const mails = async (sinceIso) => {
    const res = await (await fetch('http://localhost:8025/api/v1/messages?limit=50')).json();
    const out = [];
    for (const m of res.messages ?? []) {
        if (sinceIso && new Date(m.Created) < new Date(sinceIso)) continue;
        const full = await (await fetch(`http://localhost:8025/api/v1/message/${m.ID}`)).json();
        out.push({ subject: m.Subject, to: m.To.map((t) => t.Address), created: m.Created, text: (full.Text ?? '').slice(0, 3000) });
    }
    return out;
};

const save = (label, obj) => fs.writeFileSync(`${OUT}/${label}.json`, JSON.stringify(obj, null, 1));

module.exports = { ld, gs, gsx, batch, batchx, psql, tabs, values, createSheet, createSqlChart, createScheduler, sendAndWait, mails, save, sleep, q, qt, OUT, PROJECT, SHEETS };
