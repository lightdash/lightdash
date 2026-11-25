/**
 * Usage:
 *   pnpm -F common benchmark:number-formatting [--rows 500] [--columns 880] [--runs 5]
 */
import { createHash } from 'node:crypto';
import {
    CustomFormatType,
    formatItemValue,
    formatNumberValue,
    formatRawValue,
    formatRows,
    NumberSeparator,
    type CustomFormat,
    type ItemsMap,
} from '../src';

const argValue = (name: string, fallback: number): number => {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? Number(process.argv[index + 1]) : fallback;
};

const ROWS = argValue('rows', 500);
const COLUMNS = argValue('columns', 880);
const RUNS = argValue('runs', 5);

let seed = 42;
const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
};

const field = (
    name: string,
    fieldType: 'dimension' | 'metric',
    type: string,
    extra: Record<string, unknown> = {},
) => ({
    fieldType,
    type,
    name,
    label: name,
    table: 'wide',
    tableLabel: 'Wide',
    sql: '',
    compiledSql: '',
    tablesReferences: ['wide'],
    hidden: false,
    ...extra,
});

type ColumnKind = {
    item: Record<string, unknown>;
    value: () => unknown;
};

const columnKinds: ColumnKind[] = [
    { item: field('n', 'metric', 'sum'), value: () => random() * 1e6 },
    {
        item: field('n', 'metric', 'sum', { round: 2 }),
        value: () => random() * 1e4 - 5e3,
    },
    {
        item: field('n', 'metric', 'count'),
        value: () => Math.floor(random() * 1e5),
    },
    {
        item: field('n', 'metric', 'sum', { format: 'usd', round: 2 }),
        value: () => random() * 1e5,
    },
    {
        item: field('n', 'metric', 'average', { format: 'percent', round: 1 }),
        value: () => random(),
    },
    {
        item: field('n', 'metric', 'sum', {
            formatOptions: {
                type: CustomFormatType.NUMBER,
                separator: NumberSeparator.PERIOD_COMMA,
                round: 2,
            },
        }),
        value: () => random() * 1e7,
    },
    {
        item: field('n', 'metric', 'sum', { compact: 'thousands', round: 1 }),
        value: () => random() * 1e7,
    },
    {
        item: field('n', 'metric', 'sum', { round: -2 }),
        value: () => random() * 1e6,
    },
    {
        item: field('n', 'dimension', 'number'),
        value: () => String(Math.floor(random() * 1e4)),
    },
    {
        item: field('s', 'dimension', 'string'),
        value: () => `value ${Math.floor(random() * 1000)}`,
    },
    {
        item: field('d', 'dimension', 'date', { timeInterval: 'DAY' }),
        value: () =>
            new Date(
                Date.UTC(2020, 0, 1) + Math.floor(random() * 2000) * 864e5,
            ),
    },
    {
        item: field('t', 'dimension', 'timestamp', { timeInterval: 'RAW' }),
        value: () =>
            new Date(Date.UTC(2020, 0, 1) + Math.floor(random() * 6e10)),
    },
    { item: field('b', 'dimension', 'boolean'), value: () => random() > 0.5 },
];

const buildPage = (rows: number, columns: number) => {
    seed = 42;
    const itemsMap: ItemsMap = {};
    const generators: Array<[string, () => unknown]> = [];
    for (let c = 0; c < columns; c += 1) {
        const kind = columnKinds[c % columnKinds.length];
        const id = `wide_col_${c}`;
        itemsMap[id] = {
            ...kind.item,
            name: `col_${c}`,
        } as unknown as ItemsMap[string];
        generators.push([id, kind.value]);
    }
    const data = Array.from({ length: rows }, (_, r) => {
        const row: Record<string, unknown> = {};
        generators.forEach(([id, generate]) => {
            row[id] = r % 17 === 0 && id.endsWith('3') ? null : generate();
        });
        return row;
    });
    return { itemsMap, data };
};

const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
};

const timePerCall = (label: string, calls: number, fn: (i: number) => void) => {
    for (let i = 0; i < Math.min(calls, 2000); i += 1) fn(i);
    const samples: number[] = [];
    for (let run = 0; run < RUNS; run += 1) {
        const start = performance.now();
        for (let i = 0; i < calls; i += 1) fn(i);
        samples.push(((performance.now() - start) * 1000) / calls);
    }
    console.log(`${label.padEnd(48)} ${median(samples).toFixed(3)} us/call`);
};

const numberFormats: Array<CustomFormat | undefined> = [
    undefined,
    { type: CustomFormatType.NUMBER, round: 2 },
    { type: CustomFormatType.CURRENCY, currency: 'USD', round: 2 },
    {
        type: CustomFormatType.NUMBER,
        separator: NumberSeparator.PERIOD_COMMA,
        round: 0,
    },
    { type: CustomFormatType.NUMBER, round: -2 },
];

numberFormats.forEach((format) => {
    timePerCall(
        `formatNumberValue ${JSON.stringify(format ?? 'none')}`,
        50000,
        (i) => {
            formatNumberValue(i * 1.37, format);
        },
    );
});

const temporal = buildPage(1, columnKinds.length);
const temporalItem = (type: string) =>
    Object.values(temporal.itemsMap).find(
        (item) => (item as { type: string }).type === type,
    ) as ItemsMap[string];
const sampleDate = new Date(Date.UTC(2024, 4, 17, 13, 45, 12));
const numberItem = temporalItem('sum');
timePerCall('formatItemValue number item (sum)', 50000, (i) => {
    formatItemValue(numberItem, i * 1.37);
});
['date', 'timestamp'].forEach((type) => {
    const item = temporalItem(type);
    timePerCall(`formatItemValue ${type} item`, 20000, () => {
        formatItemValue(item, sampleDate);
    });
    timePerCall(`formatRawValue ${type} item`, 20000, () => {
        formatRawValue(
            item as Parameters<typeof formatRawValue>[0],
            sampleDate,
        );
    });
});

[
    [ROWS, COLUMNS],
    [ROWS, 30],
].forEach(([rows, columns]) => {
    const { itemsMap, data } = buildPage(rows, columns);
    formatRows(data.slice(0, 20), itemsMap);
    const samples: number[] = [];
    let hash = '';
    for (let run = 0; run < RUNS; run += 1) {
        const start = performance.now();
        const formatted = formatRows(data, itemsMap);
        samples.push(performance.now() - start);
        hash = createHash('sha256')
            .update(JSON.stringify(formatted))
            .digest('hex');
    }
    console.log(
        `formatRows ${columns} columns x ${rows} rows`.padEnd(48),
        `${median(samples).toFixed(0)} ms (median of ${RUNS})`,
    );
    console.log(`sha256 ${columns}x${rows}`.padEnd(48), hash);
});
