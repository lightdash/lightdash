import { DimensionType, FieldType, type ItemsMap } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    convertQueryResultsToCsv,
    convertQueryResultsToMarkdown,
} from './convertQueryResultsToCsv';

const fields = {
    orders_month: {
        name: 'orders_month',
        label: 'Month',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '',
        hidden: false,
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
    },
} as unknown as ItemsMap;

const queryResults = (rowCount: number) => ({
    rows: Array.from({ length: rowCount }, (_, index) => ({
        orders_month: `2026-${String(index + 1).padStart(2, '0')}`,
    })),
    fields,
});

// Header line plus one line per row, minus the trailing newline.
const countCsvRows = (csv: string) => csv.trim().split('\n').length - 1;

describe('convertQueryResultsToCsv', () => {
    it('writes every row when no bound is given', () => {
        expect(countCsvRows(convertQueryResultsToCsv(queryResults(120)))).toBe(
            120,
        );
    });

    it('writes only the bounded slice into context', () => {
        const csv = convertQueryResultsToCsv(queryResults(4_000), 50);

        expect(countCsvRows(csv)).toBe(50);
        expect(csv).toContain('2026-01');
        expect(csv).not.toContain('2026-51');
    });

    it('keeps the header when the result is smaller than the bound', () => {
        const csv = convertQueryResultsToCsv(queryResults(3), 50);

        expect(countCsvRows(csv)).toBe(3);
        expect(csv).toContain('Month');
    });

    it('produces no rows for an empty result', () => {
        // Columns come from the first row, so an empty result has no header.
        expect(
            countCsvRows(convertQueryResultsToCsv(queryResults(0), 50)),
        ).toBe(0);
    });
});

describe('convertQueryResultsToMarkdown', () => {
    it('renders a single value as a compact answer', () => {
        expect(convertQueryResultsToMarkdown(queryResults(1))).toBe(
            '**Month:** 2026-01',
        );
    });

    it('renders multiple rows as a bounded table', () => {
        const markdown = convertQueryResultsToMarkdown(queryResults(12));

        expect(markdown).toContain('| Month |');
        expect(markdown).toContain('| 2026-08 |');
        expect(markdown).not.toContain('2026-09');
        expect(markdown).toContain('Showing 8 of 12 rows and 1 columns.');
    });

    it('returns null for an empty result so the agent can recover', () => {
        expect(convertQueryResultsToMarkdown(queryResults(0))).toBeNull();
    });
});
