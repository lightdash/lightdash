// How to put a filter on a Sheets table, and how Google takes it back. Guest only; never prints the token.
// node probe2.js create | restore <sid>
const fs = require('fs');
const L = require('./lib');

const log = (o) => {
    const line = JSON.stringify({ at: new Date().toISOString(), ...o });
    console.log(line);
    fs.appendFileSync(`${L.OUT}/probe2.jsonl`, `${line}\n`);
};
const data = (n, off = 0) => [['id', 'value', 'label'], ...Array.from({ length: n }, (_, i) => [i + 1, (i + 1 + off) * 10, `row ${i + 1}`])];
const bf = async (sid) => {
    const m = await L.gs('GET', `/${sid}?fields=${encodeURIComponent('sheets(properties(title,sheetId),basicFilter,tables(tableId,range))')}`);
    return m.sheets.find((s) => s.properties.title === 'Sheet1');
};
const hidden = async (sid) => {
    const h = await L.gs('GET', `/${sid}?ranges=Sheet1&fields=${encodeURIComponent('sheets.data.rowMetadata.hiddenByFilter')}`);
    const rows = [];
    (h.sheets?.[0]?.data?.[0]?.rowMetadata ?? []).forEach((m, i) => m.hiddenByFilter && rows.push(i + 1));
    return rows;
};
const spec = [{ columnIndex: 1, filterCriteria: { condition: { type: 'NUMBER_GREATER', values: [{ userEnteredValue: '1000' }] } } }];
const fresh = async (label) => {
    const sid = await L.createSheet(`GTF probe2 ${label}`);
    const sheetId = (await L.tabs(sid)).find((t) => t.title === 'Sheet1').sheetId;
    await L.gsx('PUT', `/${sid}/values/Sheet1!A1?valueInputOption=RAW`, { values: data(200) });
    const r = await L.batchx(sid, [
        { addTable: { table: { name: `T_${label}_${Date.now()}`, range: { sheetId, startRowIndex: 0, endRowIndex: 201, startColumnIndex: 0, endColumnIndex: 3 } } } },
    ]);
    const tableId = r.json.replies?.[0]?.addTable?.table?.tableId;
    return { sid, sheetId, tableId, range: { sheetId, startRowIndex: 0, endRowIndex: 201, startColumnIndex: 0, endColumnIndex: 3 } };
};

const variants = {
    'range = table range, filterSpecs': (t) => ({ range: t.range, filterSpecs: spec }),
    'tableId only, no criteria': (t) => ({ tableId: t.tableId }),
    'tableId + criteria map': (t) => ({ tableId: t.tableId, criteria: { 1: spec[0].filterCriteria } }),
    'tableId + filterSpecs hiddenValues': (t) => ({ tableId: t.tableId, filterSpecs: [{ columnIndex: 1, filterCriteria: { hiddenValues: ['20', '30'] } }] }),
    'range (whole sheet), filterSpecs': (t) => ({ range: { sheetId: t.sheetId }, filterSpecs: spec }),
    'tableId + filterSpecs TEXT_CONTAINS col 2': (t) => ({ tableId: t.tableId, filterSpecs: [{ columnIndex: 2, filterCriteria: { condition: { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: '1' }] } } }] }),
    'tableId + sortSpecs only': (t) => ({ tableId: t.tableId, sortSpecs: [{ dimensionIndex: 0, sortOrder: 'DESCENDING' }] }),
};
const twoStep = {
    'tableId only, then range = table range + filterSpecs': (t) => [{ tableId: t.tableId }, { range: t.range, filterSpecs: spec }],
    'tableId only, then tableId + filterSpecs': (t) => [{ tableId: t.tableId }, { tableId: t.tableId, filterSpecs: spec }],
};

(async () => {
    const [cmd] = process.argv.slice(2);
    if (cmd === 'create') {
        for (const [name, mk] of Object.entries(variants)) {
            const t = await fresh(name.replace(/[^a-z]/gi, '').slice(0, 20));
            const r = await L.batchx(t.sid, [{ setBasicFilter: { filter: mk(t) } }]);
            const s = await bf(t.sid);
            log({ step: `create: ${name}`, sid: t.sid, status: r.status, error: r.error?.message, basicFilter: s.basicFilter, hiddenRows: (await hidden(t.sid)).length });
        }
        for (const [name, mk] of Object.entries(twoStep)) {
            const t = await fresh(name.replace(/[^a-z]/gi, '').slice(0, 20));
            const [a, b] = mk(t);
            const r1 = await L.batchx(t.sid, [{ setBasicFilter: { filter: a } }]);
            const r2 = await L.batchx(t.sid, [{ setBasicFilter: { filter: b } }]);
            const s = await bf(t.sid);
            log({ step: `create: ${name}`, sid: t.sid, status1: r1.status, status2: r2.status, error2: r2.error?.message, basicFilter: s.basicFilter, hiddenRows: (await hidden(t.sid)).length });
        }
        return;
    }
    // restore <sid>: a tab that already has a table filter (tableId + range in GET).
    const sid = process.argv[3];
    const s0 = await bf(sid);
    const sheetId = s0.properties.sheetId;
    const before = await hidden(sid);
    log({ step: 'restore: before', basicFilter: s0.basicFilter, hiddenRows: before.length, firstHidden: before.slice(0, 5) });
    const filter = s0.basicFilter;
    const tries = {
        'clearBasicFilter alone': [{ clearBasicFilter: { sheetId } }],
    };
    for (const [name, reqs] of Object.entries(tries)) {
        const r = await L.batchx(sid, reqs);
        const h = await hidden(sid);
        log({ step: `restore: ${name}`, status: r.status, error: r.error?.message, basicFilterAfter: (await bf(sid)).basicFilter ?? null, hiddenRowsAfter: h.length });
    }
    const putBack = {
        'GET form (tableId + range)': { ...filter, sortSpecs: undefined },
        'tableId only + filterSpecs': { tableId: filter.tableId, filterSpecs: filter.filterSpecs },
        'tableId only + criteria': { tableId: filter.tableId, criteria: filter.criteria },
        'range only + filterSpecs': { range: filter.range, filterSpecs: filter.filterSpecs },
    };
    for (const [name, f] of Object.entries(putBack)) {
        const r = await L.batchx(sid, [{ setBasicFilter: { filter: f } }]);
        const s = await bf(sid);
        log({ step: `restore: set back ${name}`, status: r.status, error: r.error?.message, basicFilterAfter: s.basicFilter ?? null, hiddenRowsAfter: (await hidden(sid)).length });
        if (r.status === 200) break;
    }
})().catch((e) => log({ fatal: String(e.stack ?? e).slice(0, 600) }));
