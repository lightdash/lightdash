import {
    getUserAttributeQueryTags,
    sanitizeQueryTagKey,
    sanitizeQueryTagValue,
} from './warehouse';

describe('getUserAttributeQueryTags', () => {
    it('prefixes and sanitizes user attribute names for query tags', () => {
        expect(
            getUserAttributeQueryTags({
                country: ['US'],
                'Plan Tier': ['Enterprise Customer/EMEA'],
            }),
        ).toEqual({
            user_attribute_country: 'us',
            user_attribute_plan_tier: 'enterprise_customer_emea',
        });
    });

    it('joins and sanitizes multi-value user attributes', () => {
        expect(
            getUserAttributeQueryTags({
                region: ['north', 'south'],
            }),
        ).toEqual({
            user_attribute_region: 'north_south',
        });
    });

    it('skips empty user attributes', () => {
        expect(
            getUserAttributeQueryTags({
                empty: [],
                blank: [''],
                whitespace: ['   '],
                present: ['yes'],
            }),
        ).toEqual({
            user_attribute_present: 'yes',
        });
    });

    it('limits user attribute query tags to safe metadata sizes', () => {
        const result = getUserAttributeQueryTags({
            ...Object.fromEntries(
                Array.from({ length: 5 }, (_, index) => [
                    `blank_${index}`,
                    [''],
                ]),
            ),
            ...Object.fromEntries(
                Array.from({ length: 25 }, (_, index) => [
                    `attribute_${index}`,
                    ['x'.repeat(250)],
                ]),
            ),
        });

        expect(Object.keys(result)).toHaveLength(20);
        expect(result.user_attribute_attribute_0).toHaveLength(60);
        expect(result.user_attribute_attribute_19).toHaveLength(60);
        expect(result.user_attribute_attribute_20).toBeUndefined();
        expect(result.user_attribute_attribute_24).toBeUndefined();
    });

    it('uses BigQuery-compatible metadata normalization', () => {
        expect(sanitizeQueryTagKey('Invalid query tag !')).toBe(
            'invalid_query_tag__',
        );
        expect(sanitizeQueryTagValue("O'Reilly Media")).toBe('o_reilly_media');
    });
});
