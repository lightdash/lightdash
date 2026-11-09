import {
    ApiConnectorType,
    FilterOperator,
    ParameterError,
    type Explore,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import { buildApiSourceExplores } from '../apiSourceExplores';
import { compileGoogleAdsQuery } from './googleAdsCompiler';

const [explore] = buildApiSourceExplores({
    connectionUuid: 'c1',
    sourceName: 'google_ads',
    name: 'Google Ads',
    apiSource: {
        connector: ApiConnectorType.GOOGLE_ADS,
        customerId: '1234567890',
        loginCustomerId: null,
    },
    scannedFields: [],
    edits: { fields: {} } as never,
});

const id = (name: string) => `google_ads_performance_${name}`;

const rule = (
    name: string,
    operator: FilterOperator,
    values: unknown[],
): FilterRule => ({
    id: name,
    target: { fieldId: id(name) },
    operator,
    values,
});

const compile = (
    query: Partial<Omit<MetricQuery, 'filters'>> & {
        dimensionRules?: FilterRule[];
        metricRules?: FilterRule[];
    },
) => {
    const { dimensionRules, metricRules, ...rest } = query;
    return compileGoogleAdsQuery({
        explore: explore as Explore,
        today: '2026-11-09',
        metricQuery: {
            exploreName: explore.name,
            dimensions: [],
            metrics: [id('clicks')],
            sorts: [],
            limit: 500,
            tableCalculations: [],
            ...rest,
            filters: {
                ...(dimensionRules
                    ? { dimensions: { id: 'd', and: dimensionRules } }
                    : {}),
                ...(metricRules
                    ? { metrics: { id: 'm', and: metricRules } }
                    : {}),
            },
        } as MetricQuery,
    });
};

const DEFAULT_RANGE = "segments.date BETWEEN '2026-10-10' AND '2026-11-08'";

describe('compileGoogleAdsQuery', () => {
    it('reads account totals from customer, over the default 30 days', () => {
        expect(compile({}).query).toBe(
            `SELECT metrics.clicks FROM customer WHERE ${DEFAULT_RANGE} LIMIT 500`,
        );
    });

    it('uses the date filter as the range, in days', () => {
        const { query } = compile({
            dimensionRules: [
                rule('date', FilterOperator.IN_BETWEEN, [
                    '2026-01-01',
                    '2026-01-31',
                ]),
            ],
        });

        expect(query).toContain(
            "WHERE segments.date BETWEEN '2026-01-01' AND '2026-01-31' LIMIT",
        );
    });

    it('splits by segments without leaving the account level', () => {
        const { query, fieldIdsByColumn } = compile({
            dimensions: [id('date'), id('device')],
        });

        expect(query).toContain('FROM customer');
        expect(query).toContain(
            'SELECT segments.date, segments.device, metrics.clicks FROM',
        );
        expect(fieldIdsByColumn).toEqual({
            'segments.date': id('date'),
            'segments.device': id('device'),
            'metrics.clicks': id('clicks'),
        });
    });

    it('picks the finest resource selected', () => {
        expect(
            compile({ dimensions: [id('campaign_name'), id('account_name')] })
                .query,
        ).toContain('FROM campaign');
        expect(
            compile({ dimensions: [id('ad_group_id'), id('campaign_name')] })
                .query,
        ).toContain('FROM ad_group');
    });

    it('selects a metric for dimension-only queries and leaves it out of the results', () => {
        const { query, fieldIdsByColumn } = compile({
            dimensions: [id('campaign_name')],
            metrics: [],
        });

        expect(query).toContain('SELECT campaign.name, metrics.impressions');
        expect(fieldIdsByColumn).toEqual({
            'campaign.name': id('campaign_name'),
        });
    });

    it('turns years into dates and leaves the other grains alone', () => {
        expect(
            compile({ dimensions: [id('date_year')] }).periodColumns,
        ).toEqual({ 'segments.year': 'year' });
        expect(
            compile({ dimensions: [id('date_month')] }).periodColumns,
        ).toEqual({});
    });

    it('sorts in the API', () => {
        const compiled = compile({
            dimensions: [id('date')],
            sorts: [
                { fieldId: id('clicks'), descending: true },
                { fieldId: id('date'), descending: false },
            ],
        });

        expect(compiled.query).toContain(
            'ORDER BY metrics.clicks DESC, segments.date ASC LIMIT',
        );
        expect(compiled.localSorts).toEqual([]);
    });

    describe('filters', () => {
        const where = (
            name: string,
            operator: FilterOperator,
            values: unknown[],
        ) =>
            compile({
                dimensions: [id('campaign_name'), id('device')],
                dimensionRules: [rule(name, operator, values)],
            }).query;

        it.each([
            [FilterOperator.EQUALS, ['Brand'], "campaign.name = 'Brand'"],
            [FilterOperator.EQUALS, ['A', 'B'], "campaign.name IN ('A', 'B')"],
            [FilterOperator.NOT_EQUALS, ['A'], "campaign.name != 'A'"],
            [
                FilterOperator.NOT_EQUALS,
                ['A', 'B'],
                "campaign.name NOT IN ('A', 'B')",
            ],
            [FilterOperator.INCLUDE, ['bra'], "campaign.name LIKE '%bra%'"],
            [FilterOperator.STARTS_WITH, ['bra'], "campaign.name LIKE 'bra%'"],
            [FilterOperator.ENDS_WITH, ['nd'], "campaign.name LIKE '%nd'"],
            [
                FilterOperator.NOT_INCLUDE,
                ['a', 'b'],
                "campaign.name NOT LIKE '%a%' AND campaign.name NOT LIKE '%b%'",
            ],
            [
                FilterOperator.INCLUDE,
                ['a', 'b'],
                "campaign.name REGEXP_MATCH '^.*(a|b).*$'",
            ],
            [
                FilterOperator.STARTS_WITH,
                ['a.', 'b'],
                "campaign.name REGEXP_MATCH '^(a\\\\.|b).*$'",
            ],
            [
                FilterOperator.ENDS_WITH,
                ['a', 'b'],
                "campaign.name REGEXP_MATCH '^.*(a|b)$'",
            ],
        ])('compiles %s %j', (operator, values, condition) => {
            expect(where('campaign_name', operator, values)).toContain(
                `AND ${condition}`,
            );
        });

        it('escapes quotes and backslashes in values', () => {
            expect(
                where('campaign_name', FilterOperator.EQUALS, ["it's a\\b"]),
            ).toContain("campaign.name = 'it\\'s a\\\\b'");
        });

        it('takes LIKE wildcards literally', () => {
            expect(
                where('campaign_name', FilterOperator.INCLUDE, ['50%_[off]']),
            ).toContain("LIKE '%50[%][_][[]off[]]%'");
        });

        it('writes ids as numbers and refuses anything else', () => {
            const ids = (values: unknown[]) =>
                compile({
                    dimensions: [id('campaign_id')],
                    dimensionRules: [
                        rule('campaign_id', FilterOperator.EQUALS, values),
                    ],
                }).query;

            expect(ids(['11', '12'])).toContain('campaign.id IN (11, 12)');
            expect(() => ids(['1 OR 1=1'])).toThrow(ParameterError);
        });

        it('quotes enum values', () => {
            expect(
                compile({
                    dimensions: [id('campaign_name'), id('campaign_status')],
                    dimensionRules: [
                        rule('campaign_status', FilterOperator.EQUALS, [
                            'ENABLED',
                        ]),
                    ],
                }).query,
            ).toContain("campaign.status = 'ENABLED'");
        });

        it('ignores disabled and empty rules', () => {
            const { query } = compile({
                dimensionRules: [
                    {
                        ...rule('account_name', FilterOperator.EQUALS, ['x']),
                        disabled: true,
                    },
                    rule('account_name', FilterOperator.EQUALS, []),
                ],
            });

            expect(query).not.toContain('customer.descriptive_name');
        });

        it('filters a metric on the returned rows', () => {
            expect(
                compile({
                    metricRules: [
                        rule('clicks', FilterOperator.GREATER_THAN, [10]),
                    ],
                }).query,
            ).toContain('AND metrics.clicks > 10');
        });

        it('filters money in micros', () => {
            expect(
                compile({
                    metrics: [id('cost')],
                    metricRules: [
                        rule('cost', FilterOperator.IN_BETWEEN, [1.5, 3]),
                    ],
                }).query,
            ).toContain(
                'AND metrics.cost_micros >= 1500000 AND metrics.cost_micros <= 3000000',
            );
        });

        it('refuses a comparison against several numbers', () => {
            expect(() =>
                compile({
                    metricRules: [
                        rule('clicks', FilterOperator.GREATER_THAN, [1, 2]),
                    ],
                }),
            ).toThrow(/one value at a time/);
        });
    });

    describe('what GAQL can not answer', () => {
        it('refuses a segment filter when the segment is not selected', () => {
            expect(() =>
                compile({
                    dimensionRules: [
                        rule('device', FilterOperator.EQUALS, ['MOBILE']),
                    ],
                }),
            ).toThrow(/only filters by Device when it's also in the results/);
        });

        it('refuses a campaign filter on a query that would not split by campaign', () => {
            const error = (() => {
                try {
                    compile({
                        dimensions: [id('date')],
                        dimensionRules: [
                            rule('campaign_name', FilterOperator.INCLUDE, [
                                'x',
                            ]),
                        ],
                    });
                    return null;
                } catch (e) {
                    return e as ParameterError;
                }
            })();

            expect(error?.message).toMatch(/can't add them back/);
            expect(error?.data).toMatchObject({
                liveSourceErrorCode: 'live_source.refused.field_combination',
                liveSourceFieldIds: [id('campaign_name')],
            });
        });

        it('allows a coarser filter than the selection', () => {
            expect(
                compile({
                    dimensions: [id('ad_group_id')],
                    dimensionRules: [
                        rule('campaign_name', FilterOperator.EQUALS, ['x']),
                    ],
                }).query,
            ).toContain(
                "FROM ad_group WHERE segments.date BETWEEN '2026-10-10' AND '2026-11-08' AND campaign.name = 'x'",
            );
        });

        it.each([
            ['campaign_status', /Add Campaign name or Campaign ID/],
            ['campaign_type', /Add Campaign name or Campaign ID/],
            ['ad_group_status', /Add Ad group ID/],
            ['ad_group_name', /Add Ad group ID/],
        ])('refuses grouping by %s alone', (name, message) => {
            expect(() => compile({ dimensions: [id(name)] })).toThrow(message);
        });

        it('accepts an ad group name with its campaign', () => {
            expect(
                compile({
                    dimensions: [id('ad_group_name'), id('campaign_name')],
                }).query,
            ).toContain('FROM ad_group');
        });

        it('accepts an attribute with its entity', () => {
            expect(
                compile({
                    dimensions: [id('campaign_status'), id('campaign_id')],
                }).query,
            ).toContain('FROM campaign');
        });
    });
});
