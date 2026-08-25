import { describe, expect, it } from 'vitest';
import {
    getExactOrPrefixLabelScore,
    getFullTextSearchQuery,
    searchReservingVerified,
} from './search';

describe('getFullTextSearchQuery', () => {
    it('builds prefix tsquery terms joined with AND by default', () => {
        expect(getFullTextSearchQuery('monthly revenue')).toBe(
            "'monthly':* & 'revenue':*",
        );
    });

    it('builds OR queries when requested', () => {
        expect(getFullTextSearchQuery('monthly revenue', 'OR')).toBe(
            "'monthly':* | 'revenue':*",
        );
    });
});

describe('getExactOrPrefixLabelScore', () => {
    it('scores exact label matches highest', () => {
        expect(getExactOrPrefixLabelScore('monthly revenue', 'Monthly Revenue')).toBe(
            2,
        );
    });

    it('scores prefix matches above partial matches', () => {
        expect(
            getExactOrPrefixLabelScore(
                'monthly revenue',
                'Monthly Revenue Forecast',
            ),
        ).toBe(1);
        expect(
            getExactOrPrefixLabelScore(
                'monthly revenue',
                'Regional Reporting - Monthly Revenue',
            ),
        ).toBe(0);
    });

    it('returns 0 for empty queries', () => {
        expect(getExactOrPrefixLabelScore('  ', 'Monthly Revenue')).toBe(0);
    });
});

describe('searchReservingVerified', () => {
    it('returns only verified results when verifiedOnly is true', async () => {
        const results = await searchReservingVerified(true, async ({ verifiedOnly }) => {
            expect(verifiedOnly).toBe(true);
            return [{ uuid: 'v1', search_rank: 1 }];
        });
        expect(results).toEqual([{ uuid: 'v1', search_rank: 1 }]);
    });

    it('merges missing verified results and re-sorts by search_rank', async () => {
        const results = await searchReservingVerified(
            false,
            async ({ verifiedOnly }) => {
                if (verifiedOnly) {
                    return [
                        { uuid: 'verified-crowded-out', search_rank: 90 },
                        { uuid: 'shared', search_rank: 5 },
                    ];
                }
                return [
                    { uuid: 'unverified-high', search_rank: 10 },
                    { uuid: 'shared', search_rank: 5 },
                    { uuid: 'unverified-low', search_rank: 1 },
                ];
            },
        );

        expect(results.map((result) => result.uuid)).toEqual([
            'verified-crowded-out',
            'unverified-high',
            'shared',
            'unverified-low',
        ]);
    });
});

describe('exact/prefix label ranking order', () => {
    it('ranks exact labels first when sorting', () => {
        const labels = [
            'Regional Reporting - Monthly Revenue',
            'Monthly Revenue',
            'Monthly Revenue Forecast',
        ];
        const query = 'monthly revenue';
        const sorted = [...labels].sort(
            (a, b) =>
                getExactOrPrefixLabelScore(query, b) -
                getExactOrPrefixLabelScore(query, a),
        );
        expect(sorted).toEqual([
            'Monthly Revenue',
            'Monthly Revenue Forecast',
            'Regional Reporting - Monthly Revenue',
        ]);
    });
});
