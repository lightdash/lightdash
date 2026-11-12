const fs = require('node:fs');
const path = require('node:path');
const median = (values) => {
    const a = values.toSorted((a, b) => a - b);
    return (
        (a[Math.floor((a.length - 1) / 2)] + a[Math.ceil((a.length - 1) / 2)]) /
        2
    );
};
const fmt = (n) => n.toFixed(2);
let output = '# Interleaved result pipeline measurements\n\n';
for (const file of fs
    .readdirSync(path.join(__dirname, 'results'))
    .filter(
        (f) =>
            f.endsWith('.jsonl') &&
            (!f.startsWith('herd') || process.env.INCLUDE_HERD === '1'),
    )) {
    const rows = fs
        .readFileSync(path.join(__dirname, 'results', file), 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(JSON.parse);
    const metrics = file.startsWith('herd')
        ? ['lostCount', 'maxEventLoopLagMs']
        : ['longestMs', 'totalMs', 'rowsPerSecond'];
    output += `## ${file}\n\n`;
    output +=
        '| Revision | Metric | Median | Min | Max | Runs |\n|---|---|---:|---:|---:|---:|\n';
    for (const ref of [...new Set(rows.map((r) => r.ref))])
        for (const metric of metrics) {
            const a = rows.filter((r) => r.ref === ref).map((r) => r[metric]);
            output += `| ${ref} | ${metric} | ${fmt(median(a))} | ${fmt(Math.min(...a))} | ${fmt(Math.max(...a))} | ${a.length} |\n`;
        }
    output += `\n| Run | Revision | ${metrics.join(' | ')} |\n|---:|---|${metrics.map(() => '---:').join('|')}|\n`;
    for (const row of rows)
        output += `| ${row.run} | ${row.ref} | ${metrics.map((m) => fmt(row[m])).join(' | ')} |\n`;
    output += '\n';
}
fs.writeFileSync(
    process.env.RESULTS_OUTPUT || path.join(__dirname, 'RESULTS.md'),
    output.trimEnd() + '\n',
);
