// node run.js '<json>'  — one SQL runner sync, then read the tab back.
// args: label, shape, n, sid?, title?, tabName?, su?, savedSqlUuid?, waitSec?, verify? (default true), offset?
const crypto = require('crypto');
const L = require('./lib');

const hash = (g) => crypto.createHash('sha256').update(`user${g}@example.com`).digest('hex');
const shapes = {
    same: (n) => ({
        cols: 7,
        sql: `SELECT encode(sha256(('user'||g||'@example.com')::bytea),'hex') AS hashed_email, '+44 7700 9'||lpad((g%100000)::text,5,'0') AS phone, (ARRAY['Oliver','Amelia','George','Isla','Harry','Ava','Noah','Mia','Jack','Sophia'])[1+g%10] AS first_name, (ARRAY['Smith','Jones','Taylor','Brown','Williams','Wilson','Johnson','Davies','Robinson','Wright'])[1+(g/10)%10] AS last_name, (ARRAY['United Kingdom','United States','Germany','France','Spain','Portugal','Ireland'])[1+g%7] AS country, (ARRAY['SW1A 1AA','EC1A 1BB','W1A 0AX','M1 1AE','B33 8TH','CR2 6XH','DN55 1PT'])[1+g%7] AS zip, timestamp '2025-01-01 00:00:00' + (g||' seconds')::interval AS added_at FROM generate_series(1,${n}) g ORDER BY g`,
        check: (row, g) => row[0] === hash(g),
    }),
    // id first: lets us check every row.
    c5: (n, off = 0) => ({
        cols: 5,
        sql: `SELECT g + ${off} AS id, md5(g::text) AS h, g * 2 AS dbl, 'r' || g AS lbl, g % 7 AS m FROM generate_series(1,${n}) g ORDER BY g`,
        check: (row, g) => row[0] === g + off && row[1] === crypto.createHash('md5').update(String(g)).digest('hex') && row[2] === g * 2,
    }),
    num3: (n, off = 0) => ({
        cols: 3,
        sql: `SELECT g AS id, (g + ${off}) * 10 AS value, 'row ' || g AS label FROM generate_series(1,${n}) g ORDER BY g`,
        check: (row, g) => row[0] === g && row[1] === (g + off) * 10,
    }),
    n9: (n, off = 0) => ({
        cols: 9,
        sql: `SELECT g AS id, (g + ${off}) * 10 AS value, 'row ' || g AS label, (ARRAY['a','b','c'])[1 + g % 3] AS category, date '2025-01-01' + g AS day, (g % 2 = 0) AS flag, round((g % 100) / 100.0, 2) AS pct, g * 1.25 AS amount, 'note ' || (g + ${off}) AS note FROM generate_series(1,${n}) g ORDER BY g`,
        check: (row, g) => row[0] === g && row[1] === (g + off) * 10 && row[8] === `note ${g + off}`,
    }),
    wide: (n) => ({
        cols: 120,
        sql: `SELECT g AS id, ${Array.from({ length: 119 }, (_, i) => `'c${i + 1}_' || g AS c${i + 1}`).join(', ')} FROM generate_series(1,${n}) g ORDER BY g`,
        check: (row, g) => row.length === 120 && row[0] === g && row[119] === `c119_${g}`,
    }),
    types: (n) => ({
        cols: 11,
        sql: `SELECT g AS id, '00' || g AS zip_text, (g % 2 = 0) AS flag, CASE WHEN g % 3 = 0 THEN NULL ELSE g * 1.5 END AS amount_or_null, date '2025-01-01' + g AS day, timestamp '2025-01-01 10:00:00' + (g || ' hours')::interval AS ts, 'TRUE' AS true_text, '1e5' AS sci_text, '50%' AS pct_text, '2024-01-02' AS date_text, '$5' AS money_text FROM generate_series(1,${n}) g ORDER BY g`,
        check: (row, g) => row[0] === g,
    }),
    inject: (n) => ({
        cols: 10,
        sql: `SELECT g AS id, '=1+1' AS eq, '+1+1' AS plus, '-1+1' AS minus, '@SUM(A1)' AS at, '=HYPERLINK("http://example.com","x")' AS link, E'\\t=1' AS tab_eq, '''quoted' AS apostrophe, '=IMPORTXML("http://example.com","//a")' AS importxml, '-5' AS neg_num_text FROM generate_series(1,${n}) g ORDER BY g`,
        check: (row, g) => row[0] === g,
    }),
    unicode: (n) => ({
        cols: 7,
        sql: `SELECT g AS id, '😀👍🏽👨‍👩‍👧 ' || g AS emoji, 'مرحبا بالعالم' AS rtl, '日本語テキスト' AS cjk, 'e' || chr(769) AS combining, 'zero' || chr(8203) || 'width' AS zw, repeat('é', 10) AS accents FROM generate_series(1,${n}) g ORDER BY g`,
        check: (row, g) => row[0] === g && row[1] === `😀👍🏽👨‍👩‍👧 ${g}` && row[4] === 'e\u0301' && row[5] === 'zero\u200bwidth',
    }),
    longtext: (n) => ({
        cols: 3,
        sql: `SELECT g AS id, repeat('x', 49999 + (g % 2)) AS long_ascii, repeat('😀', 25000) AS long_emoji FROM generate_series(1,${n}) g ORDER BY g`,
        check: (row, g) => row[0] === g && row[1].length === 49999 + (g % 2) && row[2].length === 50000,
    }),
    longover: () => ({ cols: 2, sql: `SELECT 1 AS id, repeat('x', 50001) AS too_long`, check: () => true }),
    empty: () => ({ cols: 3, sql: `SELECT g AS id, g AS v, 'x' AS t FROM generate_series(1,5) g WHERE false`, check: () => true }),
};

(async () => {
    const args = JSON.parse(process.argv[2]);
    const { label } = args;
    const result = { label, args };
    const shape = shapes[args.shape ?? 'same'](args.n, args.offset ?? 0);
    let su = args.su;
    if (!su) {
        const sql = args.sql ?? shape.sql;
        const saved = args.savedSqlUuid ?? (await L.createSqlChart(`GTF test ${label}`, sql, args.n ?? 10));
        result.savedSqlUuid = saved;
        let sid = args.sid;
        if (!sid) sid = await L.createSheet(args.title ?? `GTF test ${label}`);
        result.spreadsheetId = sid;
        su = await L.createScheduler(`/api/v1/projects/${L.PROJECT}/sqlRunner/saved/${saved}/schedulers`, {
            name: `GTF test ${label}`,
            sid,
            tabName: args.tabName,
            showFilters: args.showFilters,
        });
    } else {
        result.spreadsheetId = args.sid;
    }
    result.schedulerUuid = su;
    const sid = result.spreadsheetId;
    const run = await L.sendAndWait(su, { waitSec: args.waitSec ?? 1500, label });
    Object.assign(result, run);
    result.tabsAfter = await L.tabs(sid);
    const tab = args.tabName ? args.tabName.replaceAll(':', '.') : (args.readTab ?? result.tabsAfter.find((t) => !t.hidden)?.title);
    result.tab = tab;
    if (args.verify !== false && tab) {
        const rows = await L.values(sid, L.qt(tab));
        const n = args.n ?? 0;
        let bad = [];
        for (let g = 1; g < rows.length && bad.length < 5; g += 1) {
            if (!shape.check(rows[g], g)) bad.push({ row: g + 1, value: JSON.stringify(rows[g]).slice(0, 200) });
        }
        const maxWidth = rows.reduce((a, r) => Math.max(a, r.length), 0);
        result.readBack = {
            rows: rows.length,
            expectedRows: n + 1,
            header: rows[0] ? JSON.stringify(rows[0]).slice(0, 300) : null,
            last: rows.length ? JSON.stringify(rows[rows.length - 1]).slice(0, 200) : null,
            maxWidth,
            expectedWidth: shape.cols,
            badRows: bad,
            ok: rows.length === n + 1 && bad.length === 0 && maxWidth <= shape.cols,
        };
    }
    L.save(label, result);
    console.log(
        JSON.stringify({
            label,
            sid,
            su,
            savedSqlUuid: result.savedSqlUuid,
            final: result.final,
            durationSec: result.durationSec,
            enabledAfter: result.enabledAfter,
            readBack: result.readBack,
            tabs: result.tabsAfter.map((t) => `${t.title}${t.hidden ? '(hidden)' : ''} ${t.grid} id=${t.sheetId}`),
            errors: result.log.filter((l) => l.error).map((l) => l.error),
        }),
    );
})().catch((e) => {
    console.log(JSON.stringify({ fatal: String(e.stack ?? e) }));
    process.exit(1);
});
