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
        expect(result.metrics.length).toBeGreaterThan(0);
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

        expect(result.results).toHaveLength(2);
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

        expect(result.results).toHaveLength(2);
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
});
