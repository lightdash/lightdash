// Table and filter setup on a synced tab. Runs in the guest. Never prints the token.
// node tsetup.js table <sid> <tab> <startRow0> <endRow0> <cols>   add a Sheets table over rows [start, end)
// node tsetup.js tablefilter <sid> <tab>                          filter the table: hide rows whose value <= 1000
// node tsetup.js filter-elsewhere <sid> <tab>                     basic filter on F1:G21 (a tab with a table)
// node tsetup.js state <sid> <tab> <label>                        tables, basic filter, hidden rows -> out/<label>.json
const L = require('./lib');

const [cmd, sid, tab, a3, a4, a5] = process.argv.slice(2);
const sheetIdOf = async () => (await L.tabs(sid)).find((t) => t.title === tab)?.sheetId;
const names = ['id', 'value', 'label', 'category', 'day', 'flag', 'pct', 'amount', 'note'];

const meta = async () =>
    (
        await L.gs(
            'GET',
            `/${sid}?fields=${encodeURIComponent('sheets(properties(title,sheetId,gridProperties(rowCount,columnCount)),basicFilter,tables(tableId,name,range,columnProperties))')}`,
        )
    ).sheets.find((s) => s.properties.title === tab);

const cmds = {
    async table() {
        const id = await sheetIdOf();
        const cols = Number(a5);
        const r = await L.batchx(sid, [
            {
                addTable: {
                    table: {
                        name: `GTF_${Date.now()}`,
                        range: { sheetId: id, startRowIndex: Number(a3), endRowIndex: Number(a4), startColumnIndex: 0, endColumnIndex: cols },
                        columnProperties: Array.from({ length: cols }, (_, i) => ({ columnIndex: i, columnName: names[i] ?? `c${i}` })),
                    },
                },
            },
        ]);
        console.log(JSON.stringify({ addTable: r.status, error: r.error }));
    },
    async tablefilter() {
        const m = await meta();
        const tableId = m.tables?.[0]?.tableId;
        const r = await L.batchx(sid, [
            {
                // Google answers 500 to a table filter with criteria, so the
                // API can only make one without them: read back as tableId + range.
                setBasicFilter: { filter: { tableId } },
            },
        ]);
        console.log(JSON.stringify({ setTableFilter: r.status, error: r.error }));
    },
    // A plain filter over the table cells: hides rows, read back with range only.
    async rangefilter() {
        const m = await meta();
        const r = await L.batchx(sid, [
            {
                setBasicFilter: {
                    filter: {
                        range: m.tables[0].range,
                        filterSpecs: [{ columnIndex: 1, filterCriteria: { condition: { type: 'NUMBER_GREATER', values: [{ userEnteredValue: '1000' }] } } }],
                    },
                },
            },
        ]);
        console.log(JSON.stringify({ setRangeFilter: r.status, error: r.error }));
    },
    // A plain basic filter, no table: hides rows whose value <= 1000.
    async plainfilter() {
        const id = await sheetIdOf();
        const r = await L.batchx(sid, [
            {
                setBasicFilter: {
                    filter: {
                        range: { sheetId: id, startRowIndex: 0, endRowIndex: Number(a3), startColumnIndex: 0, endColumnIndex: Number(a4) },
                        filterSpecs: [{ columnIndex: 1, filterCriteria: { condition: { type: 'NUMBER_GREATER', values: [{ userEnteredValue: '1000' }] } } }],
                    },
                },
            },
        ]);
        console.log(JSON.stringify({ setPlainFilter: r.status, error: r.error }));
    },
    async 'filter-elsewhere'() {
        const id = await sheetIdOf();
        await L.gsx('PUT', `/${sid}/values/${L.q(`${L.qt(tab)}!F1`)}?valueInputOption=RAW`, {
            values: [['k', 'v'], ...Array.from({ length: 20 }, (_, i) => [i, i * 2])],
        });
        const r = await L.batchx(sid, [
            { setBasicFilter: { filter: { range: { sheetId: id, startRowIndex: 0, endRowIndex: 21, startColumnIndex: 5, endColumnIndex: 7 } } } },
        ]);
        console.log(JSON.stringify({ setBasicFilterElsewhere: r.status, error: r.error }));
    },
    async state() {
        const m = await meta();
        const hidden = await L.gs('GET', `/${sid}?ranges=${L.q(L.qt(tab))}&fields=${encodeURIComponent('sheets.data.rowMetadata.hiddenByFilter')}`);
        const hiddenRows = [];
        (hidden.sheets?.[0]?.data?.[0]?.rowMetadata ?? []).forEach((x, i) => x.hiddenByFilter && hiddenRows.push(i + 1));
        const tabs = await L.tabs(sid);
        const s = { grid: m.properties.gridProperties, basicFilter: m.basicFilter ?? null, tables: (m.tables ?? []).map((t) => ({ tableId: t.tableId, range: t.range })), hiddenRows, tabs: tabs.map((t) => `${t.title}${t.hidden ? '(hidden)' : ''}`) };
        L.save(a3, s);
        console.log(JSON.stringify({ label: a3, grid: `${s.grid.rowCount}x${s.grid.columnCount}`, basicFilter: s.basicFilter, tables: s.tables.map((t) => `${t.range.startRowIndex}-${t.range.endRowIndex}x${t.range.startColumnIndex}-${t.range.endColumnIndex}`), hidden: hiddenRows.length, tabs: s.tabs }));
    },
};
cmds[cmd]().catch((e) => {
    console.log(JSON.stringify({ fatal: String(e.stack ?? e).slice(0, 500) }));
    process.exit(1);
});
