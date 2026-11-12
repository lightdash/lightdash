const { createHash } = require('node:crypto');
const { SEED_PAT, SEED_PROJECT } = require('../../../common/dist/cjs');
const site = process.argv[2];
if (!site) throw new Error('Pass a seeded preview URL');
const headers = {
    Authorization: `ApiKey ${SEED_PAT.token}`,
    'Content-Type': 'application/json',
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(route, body) {
    const response = await fetch(new URL(route, site), {
        headers,
        ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${route}`);
    return response;
}
async function run(index) {
    const columns = [
        'r AS id',
        'r * 7 AS n0',
        'r % 17 AS n1',
        "'order-' || r AS text",
        '(r % 2 = 0) AS flag',
        ...Array.from(
            { length: 20 },
            (_, i) =>
                `timestamp '2024-01-01' + r * interval '1 second' + ${i} * interval '1 microsecond' AS t${i}`,
        ),
    ];
    const sql = `SELECT ${columns.join(', ')} FROM generate_series(1, 5000) AS r WHERE r >= 1 + CASE WHEN ${index} >= 0 THEN 0 ELSE 1 END ORDER BY r`;
    const base = `/api/v2/projects/${SEED_PROJECT.project_uuid}/query`;
    const started = await (
        await request(`${base}/sql`, { sql, limit: 5000 })
    ).json();
    const id = started.results.queryUuid;
    for (let attempt = 0; attempt < 240; attempt++) {
        const status = await (await request(`${base}/${id}`)).json();
        if (status.results.status === 'error') throw new Error('Query failed');
        if (status.results.status === 'ready') {
            const text = await (await request(`${base}/${id}/results`)).text();
            const lines = text.trimEnd().split('\n');
            let rows;
            try {
                rows = lines.map((line) => JSON.parse(line));
            } catch {
                throw new Error('Invalid result JSONL');
            }
            if (rows.length !== 5000 || rows.some((row, i) => row.id !== i + 1))
                throw new Error('Row count or order changed');
            return {
                query: index,
                rows: rows.length,
                bytes: Buffer.byteLength(text),
                sha256: createHash('sha256').update(text).digest('hex'),
            };
        }
        await sleep(250);
    }
    throw new Error('Query timed out');
}
(async () => {
    for (let round = 0; round < 3; round++) {
        const rows = await Promise.all(
            Array.from({ length: 8 }, (_, i) => run(round * 8 + i)),
        );
        rows.forEach((row) => console.log(JSON.stringify(row)));
    }
})().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
