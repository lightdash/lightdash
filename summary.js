// node summary.js <prefix>: one line per matrix case from out/<prefix>-<case>-{2,before,after}.json
const fs = require('fs');
const P = process.argv[2];
const dir = '/tmp/gtf/out';
const cases = [...new Set(fs.readdirSync(dir).filter((f) => f.startsWith(`${P}-`) && f.endsWith('-2.json')).map((f) => f.slice(P.length + 1, -7)))];
const rd = (f) => { try { return JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8')); } catch (e) { return null; } };
const fmtF = (b) => (b ? `${b.tableId ? 'table ' + b.tableId : 'range'} ${b.range ? `${b.range.startRowIndex}-${b.range.endRowIndex}` : ''}${b.filterSpecs ? ' +criteria' : ''}` : 'none');
const fmtT = (s) => (s?.tables ?? []).map((t) => `${t.range.startRowIndex}-${t.range.endRowIndex}`).join(',') || 'none';
for (const c of cases) {
    const r = rd(`${P}-${c}-2.json`); const b = rd(`${P}-${c}-before.json`); const a = rd(`${P}-${c}-after.json`);
    const err = (r?.log ?? []).filter((l) => l.error).map((l) => l.error).join(' | ');
    console.log(JSON.stringify({
        case: c, final: r?.final, sec: r?.durationSec, enabledAfter: r?.enabledAfter,
        rows: `${r?.readBack?.rows}/${r?.readBack?.expectedRows}`, dataOk: r?.readBack?.ok, badRows: r?.readBack?.badRows?.length,
        filterBefore: fmtF(b?.basicFilter), filterAfter: fmtF(a?.basicFilter), hiddenBefore: b?.hiddenRows?.length, hiddenAfter: a?.hiddenRows?.length,
        tableBefore: fmtT(b), tableAfter: fmtT(a), tabsAfter: (a?.tabs ?? []).join(','), error: err.slice(0, 260),
    }));
}
