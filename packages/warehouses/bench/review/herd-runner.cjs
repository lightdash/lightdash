const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const original = fs.readFileSync(
    path.join(__dirname, 'e3_herd.original.cjs'),
    'utf8',
);
const refs = [
    'a64814a3b7f4ce36d55464f0a358a9e844077a37',
    'da3da862d38c3a27e8432b9a9748125b05d916ce',
];
(async () => {
    for (let run = 1; run <= 10; run++) {
        for (const ref of refs) {
            const token = `SPK3026_BENCH_${process.pid}_${run}_${ref.slice(0, 8)}`;
            const script = original
                .replace(
                    "require(require.resolve('nats', { paths: [require('node:path').resolve(__dirname, '../../../backend')] }))",
                    `require(${JSON.stringify(require.resolve('nats', { paths: [path.resolve(__dirname, '../../../backend')] }))})`,
                )
                .replace(
                    "const STREAM='HERD_TEST', SUBJECT='herd.jobs', DURABLE='worker-herd';",
                    `const STREAM='${token}', SUBJECT='${token}.jobs', DURABLE='worker-herd';`,
                );
            const start = performance.now();
            console.error(
                `Starting unchanged herd control ${run}/10 ${ref.slice(0, 8)}`,
            );
            const summary = await new Promise((resolve, reject) => {
                const child = spawn(process.execPath, ['-e', script], {
                    stdio: ['ignore', 'pipe', 'inherit'],
                });
                let output = '';
                child.stdout.on('data', (data) => {
                    output += data;
                });
                child.on('error', reject);
                child.on('exit', (code) => {
                    if (code)
                        reject(new Error(`herd exits ${code}: ${output}`));
                    else
                        resolve(
                            JSON.parse(
                                output
                                    .slice(output.indexOf('SUMMARY ') + 8)
                                    .trim(),
                            ),
                        );
                });
            });
            const row = {
                run,
                ref,
                mode: 'unchanged-no-pipeline-control',
                totalMs: performance.now() - start,
                ...summary,
                lostCount: summary.lost.length,
            };
            fs.appendFileSync(
                path.join(__dirname, 'results/herd-control.jsonl'),
                JSON.stringify(row) + '\n',
            );
            console.error(JSON.stringify(row));
        }
    }
})().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
