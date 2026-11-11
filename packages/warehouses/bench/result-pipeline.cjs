const {
    BigQuery,
    BigQueryDate,
    BigQueryTimestamp,
    BigQueryDatetime,
    BigQueryTime,
} = require('@google-cloud/bigquery');
const { performance } = require('node:perf_hooks');
const { Readable, Transform, PassThrough } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { AsyncLocalStorage } = require('node:async_hooks');
const { createHash } = require('node:crypto');
const { createRowBatchWriter } = require('../dist/utils/streamRows');

const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const filename = path.resolve(
    __dirname,
    '../../backend/src/utils/streamUtils.ts',
);
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = Module._nodeModulePaths(path.dirname(filename));
const source = Module.stripTypeScriptTypes(fs.readFileSync(filename, 'utf8'))
    .replace(
        "import { createTimeBudgetYield } from '@lightdash/warehouses';",
        "const { createTimeBudgetYield } = require('@lightdash/warehouses');",
    )
    .replace(
        "import split2 from 'split2';",
        "const split2 = require('split2');",
    )
    .replace(
        "import { pipeline, Readable, Writable } from 'stream';",
        "const { pipeline, Readable, Writable } = require('stream');",
    )
    .replaceAll('export ', '');
mod._compile(source + '\nmodule.exports = { createJsonlWriter };', filename);
const { createJsonlWriter } = mod.exports;
const N = Number(process.env.N || 10000);
const fields = [
    ...Array.from({ length: 4 }, (_, i) => ({
        name: `n${i}`,
        type: 'INTEGER',
    })),
    ...Array.from({ length: 20 }, (_, i) => ({
        name: `t${i}`,
        type: 'TIMESTAMP',
    })),
    { name: 's0', type: 'STRING' },
];
const schema = { fields };
const raw = Array.from({ length: N }, (_, r) => ({
    f: fields.map((f, i) => ({
        v:
            f.type === 'INTEGER'
                ? String(r * 7 + i)
                : f.type === 'TIMESTAMP'
                  ? String(
                        1794398400000000n + BigInt(r * 1000003 + (i - 4) * 977),
                    )
                  : `order-${r}`,
    })),
}));
const temporal = (c) =>
    c instanceof BigQueryDate ||
    c instanceof BigQueryTimestamp ||
    c instanceof BigQueryDatetime ||
    c instanceof BigQueryTime;
const parseRow = (row) =>
    Object.fromEntries(
        Object.entries(row).map(([k, v]) => [
            k,
            v == null || typeof v === 'boolean' || typeof v === 'number'
                ? v
                : temporal(v)
                  ? new Date(v.value)
                  : `${v}`,
        ]),
    );
const als = new AsyncLocalStorage(),
    als2 = new AsyncLocalStorage();
async function run(pageSize, after) {
    const bodies = [];
    for (let i = 0; i < N; i += pageSize)
        bodies.push(
            JSON.stringify({ rows: raw.slice(i, i + pageSize), schema }),
        );
    let longest = 0,
        last = performance.now(),
        active = true;
    const tick = () => {
        const now = performance.now();
        longest = Math.max(longest, now - last);
        last = now;
        if (active) setImmediate(tick);
    };
    setImmediate(tick);
    await new Promise(setImmediate);
    longest = 0;
    last = performance.now();
    const sink = new PassThrough({ highWaterMark: 16 * 1024 * 1024 });
    let bytes = 0;
    const hash = createHash('sha256');
    const consume = (async () => {
        for await (const chunk of sink) {
            bytes += chunk.length;
            hash.update(chunk);
        }
    })();
    const writeOld = async (rows) => {
        for await (const row of rows) {
            if (!sink.write(`${JSON.stringify(row)}\n`))
                await new Promise((r) => sink.once('drain', r));
        }
    };
    const write = after ? createJsonlWriter(sink) : writeOld;
    const start = performance.now();
    await als.run({ a: 1 }, () =>
        als2.run({ b: 2 }, async () => {
            async function* source() {
                for (const body of bodies) {
                    await new Promise(setImmediate);
                    const response = JSON.parse(body);
                    const rows = BigQuery.mergeSchemaWithRows_(
                        schema,
                        response.rows,
                        {
                            wrapIntegers: false,
                            parseJSON: false,
                            listParams: {
                                'formatOptions.useInt64Timestamp': true,
                            },
                        },
                    );
                    yield* rows;
                }
            }
            const reader = Readable.from(source());
            await pipeline(
                reader,
                after
                    ? createRowBatchWriter(parseRow, write)
                    : new Transform({
                          objectMode: true,
                          async transform(row, _encoding, callback) {
                              try {
                                  await write([parseRow(row)]);
                                  callback();
                              } catch (e) {
                                  callback(e);
                              }
                          },
                      }),
            );
        }),
    );
    sink.end();
    await consume;
    const total = performance.now() - start;
    await new Promise(setImmediate);
    active = false;
    console.log(
        JSON.stringify({
            mode: after ? 'after' : 'before',
            pageSize,
            rows: N,
            longestMs: +longest.toFixed(1),
            totalMs: +total.toFixed(1),
            rowsPerSecond: Math.round((N * 1000) / total),
            bytes,
            sha256: hash.digest('hex'),
        }),
    );
}
(async () => {
    await run(100, true);
    for (let i = 0; i < 3; i++) {
        for (const size of [10000, 500, 250, 100])
            await run(size, size !== 10000);
    }
})().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
