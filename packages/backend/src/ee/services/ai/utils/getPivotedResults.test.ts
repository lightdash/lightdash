// Must stay first: loads the warehouses duckdb runtime before getPivotedResults,
// so reintroducing a second duckdb runtime turns these tests red.
import '@lightdash/warehouses';
import { SortField } from '@lightdash/common';
import { getPivotedResults } from './getPivotedResults';

describe('getPivotedResults', () => {
    it('should pivot rows with a single pivot field', async () => {
        const rows = [
            { region: 'US', quarter: 'Q1', revenue: 100 },
            { region: 'US', quarter: 'Q2', revenue: 200 },
            { region: 'EU', quarter: 'Q1', revenue: 150 },
            { region: 'EU', quarter: 'Q2', revenue: 250 },
        ];
        const fieldsMap = { region: {}, quarter: {}, revenue: {} };
        const pivotFields = ['quarter'];
        const metrics = ['revenue'];
        const sorts: SortField[] = [];

        const result = await getPivotedResults(
            rows,
            fieldsMap,
            pivotFields,
            metrics,
            sorts,
        );

        expect(result.results).toHaveLength(2);
        expect(result.metrics).toEqual(expect.arrayContaining(['Q1', 'Q2']));
        // Each row should have region + pivoted quarter columns
        for (const row of result.results) {
            expect(row).toHaveProperty('region');
            expect(row).toHaveProperty('Q1');
            expect(row).toHaveProperty('Q2');
        }
    });

    it('should pivot rows with composite pivot fields', async () => {
        const rows = [
            { region: 'US', year: '2024', quarter: 'Q1', revenue: 100 },
            { region: 'US', year: '2024', quarter: 'Q2', revenue: 200 },
            { region: 'EU', year: '2024', quarter: 'Q1', revenue: 150 },
        ];
        const fieldsMap = {
            region: {},
            year: {},
            quarter: {},
            revenue: {},
        };
        const pivotFields = ['year', 'quarter'];
        const metrics = ['revenue'];
        const sorts: SortField[] = [];

        const result = await getPivotedResults(
            rows,
            fieldsMap,
            pivotFields,
            metrics,
            sorts,
        );

        expect(result.results).toHaveLength(2);
        expect(result.metrics).toEqual(['2024 - Q1', '2024 - Q2']);
    });

    it('should handle string values with special characters', async () => {
        const rows = [
            { category: "it's a test", segment: 'A', value: 10 },
            { category: "it's a test", segment: 'B', value: 20 },
            { category: 'normal', segment: 'A', value: 30 },
        ];
        const fieldsMap = { category: {}, segment: {}, value: {} };

        const result = await getPivotedResults(
            rows,
            fieldsMap,
            ['segment'],
            ['value'],
            [],
        );

        // No ORDER BY here, so row order is unspecified
        expect(result.results).toHaveLength(2);
        expect(result.results).toEqual(
            expect.arrayContaining([
                { category: "it's a test", A: 10n, B: 20n },
                { category: 'normal', A: 30n, B: null },
            ]),
        );
    });

    it('should handle null values', async () => {
        const rows = [
            { region: 'US', quarter: 'Q1', revenue: null },
            { region: null, quarter: 'Q2', revenue: 200 },
        ];
        const fieldsMap = { region: {}, quarter: {}, revenue: {} };

        const result = await getPivotedResults(
            rows,
            fieldsMap,
            ['quarter'],
            ['revenue'],
            [],
        );

        // A null group-by value stays its own group; missing cells stay null.
        // No ORDER BY here, so row order is unspecified.
        expect(result.results).toHaveLength(2);
        expect(result.results).toEqual(
            expect.arrayContaining([
                { region: 'US', Q1: null, Q2: null },
                { region: null, Q1: null, Q2: 200n },
            ]),
        );
    });

    it('should respect sort order', async () => {
        const rows = [
            { region: 'US', quarter: 'Q1', revenue: 100 },
            { region: 'EU', quarter: 'Q1', revenue: 150 },
            { region: 'US', quarter: 'Q2', revenue: 200 },
            { region: 'EU', quarter: 'Q2', revenue: 250 },
        ];
        const fieldsMap = { region: {}, quarter: {}, revenue: {} };

        const result = await getPivotedResults(
            rows,
            fieldsMap,
            ['quarter'],
            ['revenue'],
            [{ fieldId: 'region', descending: true }],
        );

        expect(result.results[0].region).toBe('US');
        expect(result.results[1].region).toBe('EU');
    });

    it('should pivot a grouped time series after the warehouses duckdb runtime is loaded', async () => {
        const rows = [
            { order_month: '2024-01-01', status: 'placed', order_count: 3 },
            { order_month: '2024-01-01', status: 'shipped', order_count: 5 },
            { order_month: '2024-02-01', status: 'placed', order_count: 7 },
        ];
        const fieldsMap = { order_month: {}, status: {}, order_count: {} };

        const result = await getPivotedResults(
            rows,
            fieldsMap,
            ['status'],
            ['order_count'],
            [{ fieldId: 'order_month', descending: false }],
        );

        expect(result.metrics).toEqual(['placed', 'shipped']);
        expect(result.results).toEqual([
            {
                order_month: new Date('2024-01-01T00:00:00.000Z'),
                placed: 3n,
                shipped: 5n,
            },
            {
                order_month: new Date('2024-02-01T00:00:00.000Z'),
                placed: 7n,
                shipped: null,
            },
        ]);
    });

    it('should keep the legacy duckdb client value mapping', async () => {
        const rows = [
            {
                day: '2024-01-01',
                status: 'placed',
                count: 100,
                ratio: 12.5,
                flag: true,
                note: 'a',
            },
            {
                day: '2024-01-01',
                status: 'shipped',
                count: 200,
                ratio: 1.25,
                flag: false,
                note: null,
            },
        ];
        const fieldsMap = {
            day: {},
            status: {},
            count: {},
            ratio: {},
            flag: {},
            note: {},
        };

        const result = await getPivotedResults(
            rows,
            fieldsMap,
            ['status'],
            ['count', 'ratio', 'flag', 'note'],
            [],
        );

        const [row] = result.results;
        // Column order is DuckDB's: group-by columns first, then one block per pivot value
        expect(Object.keys(row)).toEqual([
            'day',
            'placed_"first"(count)',
            'placed_"first"(ratio)',
            'placed_"first"(flag)',
            'placed_"first"(note)',
            'shipped_"first"(count)',
            'shipped_"first"(ratio)',
            'shipped_"first"(flag)',
            'shipped_"first"(note)',
        ]);
        // DATE -> Date, BIGINT -> bigint, DOUBLE -> number, BOOLEAN -> boolean,
        // VARCHAR -> string, SQL NULL -> null
        expect(row.day).toEqual(new Date('2024-01-01T00:00:00.000Z'));
        expect(row['placed_"first"(count)']).toBe(100n);
        expect(row['placed_"first"(ratio)']).toBe(12.5);
        expect(row['placed_"first"(flag)']).toBe(true);
        expect(row['placed_"first"(note)']).toBe('a');
        expect(row['shipped_"first"(flag)']).toBe(false);
        expect(row['shipped_"first"(note)']).toBeNull();
    });

    it('should convert ISO-8601 dimension strings to Date', async () => {
        const rows = [
            {
                ts: '2024-01-01T10:20:30.123Z',
                status: 'placed',
                revenue: 100,
            },
            {
                ts: '2024-01-01T10:20:30.123Z',
                status: 'shipped',
                revenue: 200,
            },
        ];
        const fieldsMap = { ts: {}, status: {}, revenue: {} };

        const result = await getPivotedResults(
            rows,
            fieldsMap,
            ['status'],
            ['revenue'],
            [],
        );

        // read_json_auto infers ISO-8601 strings as TIMESTAMP, so the dimension
        // comes back as a Date rather than the original string.
        expect(result.results[0].ts).toEqual(
            new Date('2024-01-01T10:20:30.123Z'),
        );
    });

    it('treats a malicious metric name as an identifier instead of executing it', async () => {
        const rows = [
            { region: 'US', quarter: 'Q1', revenue: 100 },
            { region: 'US', quarter: 'Q2', revenue: 200 },
        ];
        const fieldsMap = { region: {}, quarter: {}, revenue: {} };
        const maliciousMetric =
            "revenue) FROM results_data; SELECT read_text('/etc/hosts') --";

        await expect(
            getPivotedResults(
                rows,
                fieldsMap,
                ['quarter'],
                [maliciousMetric],
                [],
            ),
        ).rejects.toThrow();
    });

    it('quotes group-by and sort identifiers so odd column names still pivot', async () => {
        const oddId = 'region "x" (raw)';
        const rows = [
            { [oddId]: 'US', quarter: 'Q1', revenue: 100 },
            { [oddId]: 'US', quarter: 'Q2', revenue: 200 },
            { [oddId]: 'EU', quarter: 'Q1', revenue: 150 },
        ];
        const fieldsMap = { [oddId]: {}, quarter: {}, revenue: {} };

        const result = await getPivotedResults(
            rows,
            fieldsMap,
            ['quarter'],
            ['revenue'],
            [{ fieldId: oddId, descending: true }],
        );

        expect(result.results).toHaveLength(2);
        expect(result.results.map((row) => row[oddId])).toEqual(['US', 'EU']);
    });

    it('should apply nulls first/last on sorted group-by columns', async () => {
        const rows = [
            { region: 'US', quarter: 'Q1', revenue: 100 },
            { region: null, quarter: 'Q1', revenue: 150 },
        ];
        const fieldsMap = { region: {}, quarter: {}, revenue: {} };

        const nullsFirst = await getPivotedResults(
            rows,
            fieldsMap,
            ['quarter'],
            ['revenue'],
            [{ fieldId: 'region', descending: false, nullsFirst: true }],
        );
        expect(nullsFirst.results.map((row) => row.region)).toEqual([
            null,
            'US',
        ]);

        const nullsLast = await getPivotedResults(
            rows,
            fieldsMap,
            ['quarter'],
            ['revenue'],
            [{ fieldId: 'region', descending: false, nullsFirst: false }],
        );
        expect(nullsLast.results.map((row) => row.region)).toEqual([
            'US',
            null,
        ]);
    });
});
