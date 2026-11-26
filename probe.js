// Direct Sheets API probes for tables and filters. Runs inside a Rainbow guest.
// node probe.js <probe> [<probe> ...]   (or "all")
// Logs one JSON line per step: probe, step, HTTP status, Google error. Never prints the token.
const fs = require('fs');
const L = require('./lib');

const log = (o) => {
    const line = JSON.stringify({ at: new Date().toISOString(), ...o });
    console.log(line);
    fs.appendFileSync(`${L.OUT}/probe.jsonl`, `${line}\n`);
};

const retry429 = async (fn) => {
    for (let i = 0; i < 6; i += 1) {
        const r = await fn();
        if (r.status !== 429) return r;
        await L.sleep(15000 * (i + 1));
    }
    return fn();
};
const bx = (sid, requests) => retry429(() => L.batchx(sid, requests));
const step = async (probe, name, sid, requests) => {
    const r = await bx(sid, requests);
    log({ probe, step: name, status: r.status, error: r.error });
    return r;
};

const data = (n, cols = 3, off = 0) => {
    const header = ['id', 'value', 'label', 'category', 'day', 'flag', 'pct', 'amount', 'note'].slice(0, cols);
    const rows = Array.from({ length: n }, (_, i) => {
        const g = i + 1;
        return [g, (g + off) * 10, `row ${g}`, ['a', 'b', 'c'][g % 3], 45000 + g, g % 2 === 0, (g % 100) / 100, g * 1.25, `note ${g + off}`].slice(0, cols);
    });
    return [header, ...rows];
};

const putValues = async (sid, range, values) => {
    const r = await retry429(() =>
        L.gsx('PUT', `/${sid}/values/${L.q(range)}?valueInputOption=RAW`, { values }),
    );
    if (r.status !== 200) throw new Error(`put ${range}: ${r.status} ${JSON.stringify(r.json.error)}`);
};

const sheetIdOf = async (sid, title) => (await L.tabs(sid)).find((t) => t.title === title)?.sheetId;

const make = async (probe, n, cols = 3) => {
    const sid = await L.createSheet(`GTF probe ${probe}`);
    const sheetId = await sheetIdOf(sid, 'Sheet1');
    await putValues(sid, 'Sheet1!A1', data(n, cols));
    log({ probe, step: 'created', sid, sheetId, rows: n + 1, cols });
    return { sid, sheetId };
};

const COLTYPES = ['DOUBLE', 'DOUBLE', 'TEXT', 'TEXT', 'DATE', 'BOOLEAN', 'PERCENT', 'DOUBLE', 'TEXT'];
const NAMES = ['id', 'value', 'label', 'category', 'day', 'flag', 'pct', 'amount', 'note'];
const addTable = async (probe, sid, sheetId, { start = 0, end, startCol = 0, endCol = 3, name = `T_${probe}`.replace(/[^A-Za-z0-9_]/g, '_'), types = true, dropdown = false }) => {
    const columnProperties = Array.from({ length: endCol - startCol }, (_, i) => {
        const base = { columnIndex: i, columnName: NAMES[i + startCol] ?? `col${i + startCol}` };
        if (!types) return base;
        if (dropdown && NAMES[i + startCol] === 'category') {
            return {
                ...base,
                columnType: 'DROPDOWN',
                dataValidationRule: { condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: 'a' }, { userEnteredValue: 'b' }] } },
            };
        }
        return { ...base, columnType: COLTYPES[i + startCol] ?? 'TEXT' };
    });
    const r = await step(probe, `addTable rows ${start}-${end} cols ${startCol}-${endCol}${dropdown ? ' dropdown' : ''}`, sid, [
        {
            addTable: {
                table: {
                    name,
                    range: { sheetId, startRowIndex: start, endRowIndex: end, startColumnIndex: startCol, endColumnIndex: endCol },
                    columnProperties,
                },
            },
        },
    ]);
    return r.json.replies?.[0]?.addTable?.table?.tableId;
};

const state = async (probe, sid, label) => {
    const meta = await L.gs(
        'GET',
        `/${sid}?fields=${encodeURIComponent('sheets(properties(title,sheetId,hidden,gridProperties(rowCount,columnCount)),basicFilter,tables(tableId,name,range),filterViews)')}`,
    );
    const hidden = await L.gs(
        'GET',
        `/${sid}?ranges=${L.q('Sheet1')}&fields=${encodeURIComponent('sheets.data.rowMetadata.hiddenByFilter')}`,
    );
    const hiddenRows = [];
    (hidden.sheets?.[0]?.data?.[0]?.rowMetadata ?? []).forEach((m, i) => {
        if (m.hiddenByFilter) hiddenRows.push(i + 1);
    });
    const s = {
        probe,
        step: `state ${label}`,
        error: meta.error?.message,
        sheets: (meta.sheets ?? []).map((x) => ({
            title: x.properties.title,
            hidden: !!x.properties.hidden,
            grid: `${x.properties.gridProperties?.rowCount}x${x.properties.gridProperties?.columnCount}`,
            basicFilter: x.basicFilter,
            tables: x.tables,
            filterViews: x.filterViews?.length ?? 0,
        })),
        hiddenByFilterRows: `${hiddenRows.length}: ${hiddenRows.slice(0, 8).join(',')}${hiddenRows.length > 8 ? ',…' : ''}`,
    };
    log(s);
    return s;
};

// Checks every row of Sheet1 against data(n, cols, off): returns mismatching row numbers.
const check = async (probe, sid, n, cols, off, label) => {
    const rows = await L.values(sid, 'Sheet1');
    const want = data(n, cols, off);
    const bad = [];
    for (let i = 0; i < Math.max(rows.length, want.length); i += 1) {
        const a = JSON.stringify((rows[i] ?? []).slice(0, cols));
        const b = JSON.stringify(want[i] ?? []);
        const extra = (rows[i] ?? []).slice(cols).some((v) => v !== '');
        if (a !== b || extra) bad.push(i + 1);
    }
    log({ probe, step: `check ${label}`, rows: rows.length, expected: want.length, badRows: bad.length, firstBad: bad.slice(0, 6), sample: bad[0] ? JSON.stringify(rows[bad[0] - 1]) : undefined });
    return bad;
};

const staging = async (probe, sid, n, cols, off) => {
    const r = await step(probe, 'add staging tab', sid, [
        { addSheet: { properties: { title: 'Lightdash sync in progress probe', hidden: true, gridProperties: { rowCount: n + 1, columnCount: cols } } } },
    ]);
    const id = r.json.replies[0].addSheet.properties.sheetId;
    await putValues(sid, `'Lightdash sync in progress probe'!A1`, data(n, cols, off));
    return id;
};

const copy = (from, to, rows, cols) => ({
    copyPaste: {
        source: { sheetId: from, startRowIndex: 0, endRowIndex: rows, startColumnIndex: 0, endColumnIndex: cols },
        destination: { sheetId: to, startRowIndex: 0, endRowIndex: rows, startColumnIndex: 0, endColumnIndex: cols },
        pasteType: 'PASTE_VALUES',
        pasteOrientation: 'NORMAL',
    },
});
const leftover = (sheetId, rowCount, columnCount, gridRows, gridCols) => [
    ...(gridRows > rowCount ? [{ updateCells: { range: { sheetId, startRowIndex: rowCount }, fields: 'userEnteredValue' } }] : []),
    ...(gridCols > columnCount
        ? [{ updateCells: { range: { sheetId, startRowIndex: 0, endRowIndex: rowCount, startColumnIndex: columnCount }, fields: 'userEnteredValue' } }]
        : []),
];
const tableFilter = (tableId) => ({
    setBasicFilter: {
        filter: {
            tableId,
            filterSpecs: [{ columnIndex: 1, filterCriteria: { condition: { type: 'NUMBER_GREATER', values: [{ userEnteredValue: '1000' }] } } }],
        },
    },
});
const getBasicFilter = async (sid) =>
    (await L.gs('GET', `/${sid}?fields=${encodeURIComponent('sheets(properties(title),basicFilter)')}`)).sheets.find((s) => s.properties.title === 'Sheet1')
        .basicFilter;

const probes = {
    // GET with the field mask main uses, on tabs with tables with and without a filter.
    async get() {
        const p = 'get';
        const { sid, sheetId } = await make(p, 200);
        const fields =
            'sheets(properties(sheetId,title,hidden,gridProperties(rowCount,columnCount)),basicFilter,developerMetadata(metadataKey,metadataValue))';
        const g = async (label) => {
            const r = await L.gsx('GET', `/${sid}?fields=${encodeURIComponent(fields)}`);
            log({ probe: p, step: `GET main field mask ${label}`, status: r.status, error: r.json.error?.message, basicFilter: r.json.sheets?.[0]?.basicFilter });
        };
        await g('no table');
        const tableId = await addTable(p, sid, sheetId, { end: 201 });
        await g('table, no filter');
        await step(p, 'set table filter (tableId only)', sid, [tableFilter(tableId)]);
        await g('table with filter');
        await step(p, 'createDeveloperMetadata on tab with table', sid, [
            { createDeveloperMetadata: { developerMetadata: { metadataKey: 'lightdash.sync.claim', metadataValue: 'x', location: { sheetId }, visibility: 'DOCUMENT' } } },
        ]);
        await step(p, 'delete+create developer metadata', sid, [
            { deleteDeveloperMetadata: { dataFilter: { developerMetadataLookup: { metadataKey: 'lightdash.sync.claim', metadataLocation: { sheetId } } } } },
            { createDeveloperMetadata: { developerMetadata: { metadataKey: 'lightdash.sync.claim', metadataValue: 'y', location: { sheetId }, visibility: 'DOCUMENT' } } },
        ]);
        await g('after metadata');
    },

    // Table over exactly the data, with a filter. Replays main's swap batch and the variants.
    async filter() {
        const p = 'filter';
        const { sid, sheetId } = await make(p, 200);
        const tableId = await addTable(p, sid, sheetId, { end: 201 });
        await state(p, sid, 'table, no filter');
        await step(p, 'set table filter (tableId only)', sid, [tableFilter(tableId)]);
        const s = await state(p, sid, 'table filter on');
        const bf = s.sheets.find((x) => x.title === 'Sheet1').basicFilter;
        const stg = await staging(p, sid, 200, 3, 7);
        await step(p, 'main swap: clear, paste, setBasicFilter(GET form without sortSpecs)', sid, [
            { clearBasicFilter: { sheetId } },
            copy(stg, sheetId, 201, 3),
            { setBasicFilter: { filter: { ...bf, sortSpecs: undefined } } },
        ]);
        await step(p, 'setBasicFilter with range only (no tableId)', sid, [
            { clearBasicFilter: { sheetId } },
            { setBasicFilter: { filter: { range: bf.range, filterSpecs: bf.filterSpecs } } },
        ]);
        await state(p, sid, 'after range-only attempt');
        await step(p, 'restore with tableId only: clear, paste, set {tableId, filterSpecs}', sid, [
            { clearBasicFilter: { sheetId } },
            copy(stg, sheetId, 201, 3),
            { setBasicFilter: { filter: { tableId: bf.tableId, filterSpecs: bf.filterSpecs } } },
        ]);
        await state(p, sid, 'after tableId-only restore');
        await check(p, sid, 200, 3, 7, 'after tableId-only restore (all rows, hidden too)');
        await step(p, 'restore with tableId + criteria (GET form, no range, no sortSpecs)', sid, [
            { clearBasicFilter: { sheetId } },
            { setBasicFilter: { filter: { ...bf, range: undefined, sortSpecs: undefined } } },
        ]);
        await state(p, sid, 'after GET-form-without-range restore');
    },

    // Does copyPaste skip rows hidden by a table filter?
    async skip() {
        const p = 'skip';
        const { sid, sheetId } = await make(p, 200);
        const tableId = await addTable(p, sid, sheetId, { end: 201 });
        await step(p, 'set table filter', sid, [tableFilter(tableId)]);
        await state(p, sid, 'filter on');
        const stg = await staging(p, sid, 200, 3, 3);
        await step(p, 'paste with the filter on (no clear)', sid, [copy(stg, sheetId, 201, 3)]);
        await check(p, sid, 200, 3, 3, 'after paste with table filter on');
    },

    // A basic filter elsewhere on a tab with a table.
    async elsewhere() {
        const p = 'elsewhere';
        const { sid, sheetId } = await make(p, 200);
        await putValues(sid, 'Sheet1!F1', [['k', 'v'], ...Array.from({ length: 20 }, (_, i) => [i, i * 2])]);
        await addTable(p, sid, sheetId, { end: 201 });
        await step(p, 'setBasicFilter range F1:G21 on a tab with a table', sid, [
            { setBasicFilter: { filter: { range: { sheetId, startRowIndex: 0, endRowIndex: 21, startColumnIndex: 5, endColumnIndex: 7 } } } },
        ]);
        await state(p, sid, 'after');
        const p2 = 'elsewhere2';
        const b = await make(p2, 200);
        await step(p2, 'setBasicFilter range A1:C201 first', b.sid, [
            { setBasicFilter: { filter: { range: { sheetId: b.sheetId, startRowIndex: 0, endRowIndex: 201, startColumnIndex: 0, endColumnIndex: 3 } } } },
        ]);
        await addTable(p2, b.sid, b.sheetId, { start: 300, end: 311, startCol: 0, endCol: 3, types: false });
        await state(p2, b.sid, 'basic filter on data, table below');
    },

    // Table shapes against main's paste + leftover clear (no filter).
    async shapes() {
        const cases = [
            { p: 'exact-shrink', n: 200, table: { end: 201 }, newN: 70 },
            { p: 'exact-grow', n: 200, table: { end: 201 }, newN: 333 },
            { p: 'smaller', n: 200, table: { end: 51 }, newN: 200 },
            { p: 'larger-rows', n: 200, table: { end: 501 }, newN: 200 },
            { p: 'larger-cols', n: 200, cols: 3, table: { end: 201, endCol: 5 }, newN: 200 },
            { p: 'below', n: 200, table: { start: 300, end: 311, types: false }, newN: 200 },
            { p: 'right', n: 200, table: { start: 0, end: 21, startCol: 5, endCol: 7, types: false }, newN: 200 },
            { p: 'header-only-below', n: 200, table: { start: 250, end: 252, types: false }, newN: 200 },
        ];
        for (const c of cases) {
            const cols = c.cols ?? 3;
            const { sid, sheetId } = await make(c.p, c.n, cols);
            await addTable(c.p, sid, sheetId, c.table);
            await state(c.p, sid, 'before');
            const stg = await staging(c.p, sid, c.newN, cols, 5);
            const grid = (await L.tabs(sid)).find((t) => t.title === 'Sheet1').grid.split('x').map(Number);
            const gridRows = Math.max(grid[0], c.newN + 1);
            await step(c.p, `main swap (grow ${gridRows !== grid[0]}): paste ${c.newN + 1} rows + leftover clear + delete staging`, sid, [
                ...(gridRows !== grid[0] ? [{ updateSheetProperties: { properties: { sheetId, gridProperties: { rowCount: gridRows, columnCount: grid[1] } }, fields: 'gridProperties.rowCount,gridProperties.columnCount' } }] : []),
                copy(stg, sheetId, c.newN + 1, cols),
                ...leftover(sheetId, c.newN + 1, cols, gridRows, grid[1]),
                { deleteSheet: { sheetId: stg } },
            ]);
            await state(c.p, sid, 'after');
            await check(c.p, sid, c.newN, cols, 5, 'after');
        }
    },

    // Typed and dropdown columns.
    async types() {
        const p = 'types';
        const { sid, sheetId } = await make(p, 100, 9);
        await addTable(p, sid, sheetId, { end: 101, endCol: 9, dropdown: true });
        await state(p, sid, 'before');
        const stg = await staging(p, sid, 150, 9, 2);
        await step(p, 'paste 151 rows of 9 cols into typed table with dropdown (value c not in list)', sid, [
            { updateSheetProperties: { properties: { sheetId, gridProperties: { rowCount: 1000, columnCount: 26 } }, fields: 'gridProperties.rowCount,gridProperties.columnCount' } },
            copy(stg, sheetId, 151, 9),
            ...leftover(sheetId, 151, 9, 1000, 26),
        ]);
        await state(p, sid, 'after');
        await check(p, sid, 150, 9, 2, 'after');
    },
};

(async () => {
    const names = process.argv.slice(2);
    for (const n of names[0] === 'all' ? Object.keys(probes) : names) {
        try {
            await probes[n]();
        } catch (e) {
            log({ probe: n, fatal: String(e.stack ?? e).slice(0, 800) });
        }
    }
})();
