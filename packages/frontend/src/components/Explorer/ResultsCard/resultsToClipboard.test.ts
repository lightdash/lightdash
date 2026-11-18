import { type ResultRow } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { resultsToCsv, resultsToHtmlTable } from './resultsToClipboard';

const columns = [
    { fieldId: 'orders_status', label: 'Status' },
    { fieldId: 'orders_total', label: 'Total, USD' },
];

const rows: ResultRow[] = [
    {
        orders_status: { value: { raw: 'shipped', formatted: 'shipped' } },
        orders_total: { value: { raw: 1200.5, formatted: '$1,200.50' } },
    },
    {
        orders_status: { value: { raw: 'said "hi"', formatted: 'said "hi"' } },
        orders_total: { value: { raw: null, formatted: '∅' } },
    },
];

describe('resultsToCsv', () => {
    it('writes a header row and formatted values, escaping CSV characters', () => {
        expect(resultsToCsv(columns, rows)).toBe(
            [
                'Status,"Total, USD"',
                'shipped,"$1,200.50"',
                '"said ""hi""",',
            ].join('\r\n'),
        );
    });

    it('writes an empty cell for a missing field or null value', () => {
        expect(resultsToCsv(columns, [{}])).toBe('Status,"Total, USD"\r\n,');
    });
});

describe('resultsToHtmlTable', () => {
    it('escapes HTML in labels and values', () => {
        const html = resultsToHtmlTable(
            [{ fieldId: 'a', label: '<b>' }],
            [{ a: { value: { raw: 'x&y', formatted: 'x&y' } } }],
        );
        expect(html).toBe(
            '<table><thead><tr><th>&lt;b&gt;</th></tr></thead><tbody><tr><td>x&amp;y</td></tr></tbody></table>',
        );
    });
});
