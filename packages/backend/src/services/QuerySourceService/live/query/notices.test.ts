import { getTruncatedNotice } from './notices';

describe('getTruncatedNotice', () => {
    test('asks for a higher limit when the query stopped at its own limit', () => {
        expect(
            getTruncatedNotice({
                label: 'GA4',
                rowCount: 500,
                maxRows: 10_000,
            }),
        ).toEqual({
            type: 'truncated',
            rowCount: 500,
            message:
                'Showing the first 500 rows. GA4 has more: raise the row limit or add filters to see the rest.',
        });
    });

    test('asks for filters when the query read all one query can', () => {
        expect(
            getTruncatedNotice({
                label: 'Search Console',
                rowCount: 24_999,
                maxRows: 24_999,
            }).message,
        ).toBe(
            'Showing the first 24,999 rows, the most one query can return. Search Console has more: add filters to see the rest.',
        );
    });
});
