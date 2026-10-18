// usage: node compare.mjs baseline.json candidate.json  -> markdown table
import { readFileSync } from 'node:fs';
const [a, b] = process.argv.slice(2).map((p) => JSON.parse(readFileSync(p, 'utf8')));
const median = (xs) => { const s = [...xs].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const summarize = (d) => {
    const cold = d.runs.find((r) => r.invalidateCache)?.wallMs ?? null;
    const warm = d.runs.filter((r) => !r.invalidateCache);
    return { cold, warm: median(warm.map((r) => r.wallMs)), p95: median(warm.map((r) => r.tileReadyP95)), errors: Math.max(...d.runs.map((r) => r.errors)), tiles: d.chartTiles };
};
console.log('| Dashboard | Chart tiles | Cold wall ms (base → new) | Warm wall ms (base → new) | Warm tile p95 ms (base → new) | Errors |');
console.log('|---|---|---|---|---|---|');
for (const dash of b.dashboards) {
    const base = a.dashboards.find((d) => d.name === dash.name);
    const n = summarize(dash);
    const o = base ? summarize(base) : null;
    const f = (x, y) => (o ? `${x} → ${y}` : `${y}`);
    console.log(`| ${dash.name} | ${n.tiles} | ${f(o?.cold, n.cold)} | ${f(o?.warm, n.warm)} | ${f(o?.p95, n.p95)} | ${n.errors} |`);
}
