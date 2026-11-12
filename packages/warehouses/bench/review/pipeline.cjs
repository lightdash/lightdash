const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const { createHash } = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const { Readable, Transform, PassThrough, pipeline } = require('node:stream');
const root = path.resolve(__dirname, '../../../..');
const sdk = require('@google-cloud/bigquery');
const esbuild = require(
    require.resolve('esbuild', {
        paths: [
            path.dirname(
                require.resolve('vite', {
                    paths: [path.join(root, 'packages/frontend')],
                }),
            ),
        ],
    }),
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sourceAt = (ref, name) =>
    ref === 'working'
        ? fs.readFileSync(path.join(root, name), 'utf8')
        : execFileSync('git', ['show', `${ref}:${name}`], {
              cwd: root,
              encoding: 'utf8',
          });
function load(ref, name, overrides = {}) {
    const filename = path.join(root, name);
    const mod = new Module(filename, module);
    mod.filename = filename;
    mod.paths = Module._nodeModulePaths(path.dirname(filename));
    const original = mod.require.bind(mod);
    mod.require = (id) =>
        Object.hasOwn(overrides, id) ? overrides[id] : original(id);
    mod._compile(
        esbuild.transformSync(sourceAt(ref, name), {
            loader: 'ts',
            format: 'cjs',
        }).code,
        filename,
    );
    return mod.exports;
}
function prepare(ref, pageSize = null, latencyMs = 0) {
    const bq = sourceAt(
        ref,
        'packages/warehouses/src/warehouseClients/BigqueryWarehouseClient.ts',
    );
    const isHead = bq.includes('createRowBatch');
    const helpers = isHead
        ? load(ref, 'packages/warehouses/src/utils/streamRows.ts')
        : {};
    const utils = load(ref, 'packages/backend/src/utils/streamUtils.ts', {
        '@lightdash/warehouses': helpers,
    });
    const s3 = sourceAt(
        ref,
        'packages/backend/src/clients/ResultsFileStorageClients/S3ResultsFileStorageClient.ts',
    );
    const start = s3.indexOf(
        isHead ? '        const writeRows = ' : '        const write = async',
    );
    const end = s3.indexOf(
        '        return { write, close, writeStream:',
        start,
    );
    const writeFactory = new Function(
        'passThrough',
        'createJsonlWriter',
        'writeWithBackpressure',
        'Logger',
        'getErrorMessage',
        'fileName',
        esbuild.transformSync(s3.slice(start, end) + '\nreturn write;', {
            loader: 'ts',
        }).code,
    );
    const converters =
        bq.slice(
            bq.indexOf('const isBigqueryDecimal'),
            bq.indexOf('export const getBigqueryTimestampDomain'),
        ) +
        bq.slice(
            bq.indexOf('const parseRow ='),
            bq.indexOf('type BigqueryError'),
        );
    const method = bq
        .slice(
            bq.indexOf('    private async streamResults('),
            bq.indexOf('    async streamQuery('),
        )
        .replace('private async', 'async');
    const configured =
        pageSize ??
        Number(bq.match(/BIGQUERY_RESULTS_PAGE_SIZE = (\d+)/)?.[1] ?? 10000);
    const build = esbuild.transformSync(
        converters +
            '\nclass Client {\n' +
            method +
            '\n}\nreturn new Client();',
        { loader: 'ts' },
    ).code;
    const client = new Function(
        ...Object.keys(sdk),
        'pipeline',
        'Transform',
        'Readable',
        'createRowBatchWriter',
        'createRowBatchProcessor',
        'BIGQUERY_RESULTS_PAGE_SIZE',
        'BIGQUERY_CONVERSION_BATCH_SIZE',
        build,
    )(
        ...Object.values(sdk),
        pipeline,
        Transform,
        Readable,
        helpers.createRowBatchWriter,
        helpers.createRowBatchProcessor,
        configured,
        Number(bq.match(/BIGQUERY_CONVERSION_BATCH_SIZE = (\d+)/)?.[1] ?? 64),
    );
    const fields = [];
    for (let i = 0; i < 4; i++)
        fields.push({ name: `n${i}`, type: 'INTEGER', mode: 'NULLABLE' });
    for (let i = 0; i < 20; i++)
        fields.push({ name: `t${i}`, type: 'TIMESTAMP', mode: 'NULLABLE' });
    fields.push({ name: 's0', type: 'STRING', mode: 'NULLABLE' });
    const schema = { fields };
    const raw = Array.from({ length: 10000 }, (_, r) => ({
        f: fields.map((f, i) => ({
            v:
                f.type === 'INTEGER'
                    ? String(r * 7 + i)
                    : f.type === 'TIMESTAMP'
                      ? String(
                            1794398400000000n +
                                BigInt(r * 1000003 + (i - 4) * 977),
                        )
                      : `order-${r}`,
        })),
    }));
    const bodies = new Map();
    for (let i = 0; i < raw.length; i += configured)
        bodies.set(
            String(i),
            JSON.stringify({
                schema,
                jobComplete: true,
                rows: raw.slice(i, i + configured),
                ...(i + configured < raw.length
                    ? { pageToken: String(i + configured) }
                    : {}),
            }),
        );
    const als = new AsyncLocalStorage(),
        als2 = new AsyncLocalStorage();
    return async function run() {
        let requests = 0;
        const bigquery = new sdk.BigQuery({ projectId: 'synthetic-benchmark' });
        bigquery.request = (options, callback) => {
            requests++;
            const respond = () =>
                callback(
                    null,
                    JSON.parse(bodies.get(options.qs.pageToken ?? '0')),
                );
            if (latencyMs) setTimeout(respond, latencyMs);
            else setImmediate(respond);
        };
        const job = bigquery.job('synthetic-benchmark');
        const sink = new PassThrough({ highWaterMark: 16 * 1024 * 1024 });
        const write = writeFactory(
            sink,
            utils.createJsonlWriter,
            utils.writeWithBackpressure,
            { error() {} },
            String,
            'synthetic',
        );
        let bytes = 0;
        const hash = createHash('sha256');
        const consumer = (async () => {
            for await (const chunk of sink) {
                bytes += chunk.length;
                hash.update(chunk);
            }
        })();
        let unpivoted = {};
        const transformRows = async (rows) => {
            if (!Object.keys(unpivoted).length)
                unpivoted = Object.fromEntries(
                    Object.keys(rows[0]).map((k) => [k, { reference: k }]),
                );
            await write(rows);
        };
        const histogram = monitorEventLoopDelay({ resolution: 1 });
        histogram.enable();
        let gap = 0,
            last = performance.now();
        const timer = setInterval(() => {
            const now = performance.now();
            gap = Math.max(gap, now - last);
            last = now;
        }, 1);
        await sleep(20);
        histogram.reset();
        gap = 0;
        last = performance.now();
        const startCpu = process.cpuUsage();
        const startTime = performance.now();
        await als.run({ a: 1 }, () =>
            als2.run({ b: 2 }, () =>
                client.streamResults(
                    job,
                    isHead ? transformRows : (row) => transformRows([row]),
                ),
            ),
        );
        sink.end();
        await consumer;
        const totalMs = performance.now() - startTime;
        const cpu = process.cpuUsage(startCpu);
        await sleep(5);
        clearInterval(timer);
        histogram.disable();
        return {
            ref,
            pageSize: configured,
            latencyMs,
            longestMs: Math.max(gap, histogram.max / 1e6),
            histogramMaxMs: histogram.max / 1e6,
            totalMs,
            cpuMs: (cpu.user + cpu.system) / 1000,
            rowsPerSecond: (10000 * 1000) / totalMs,
            requests,
            bytes,
            sha256: hash.digest('hex'),
        };
    };
}
module.exports = { prepare };
if (require.main === module) {
    const base =
        process.env.BASE_REF || 'a64814a3b7f4ce36d55464f0a358a9e844077a37';
    const head =
        process.env.HEAD_REF || 'da3da862d38c3a27e8432b9a9748125b05d916ce';
    const variants = [
        prepare(base, null, Number(process.env.LATENCY_MS || 0)),
        prepare(
            head,
            process.env.PAGE_SIZE ? Number(process.env.PAGE_SIZE) : null,
            Number(process.env.LATENCY_MS || 0),
        ),
    ];
    (async () => {
        for (let i = 1; i <= Number(process.env.RUNS || 10); i++)
            for (const run of variants)
                console.log(JSON.stringify({ run: i, ...(await run()) }));
    })().catch((e) => {
        console.error(e);
        process.exitCode = 1;
    });
}
