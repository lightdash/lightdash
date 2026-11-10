import {
    ApiConnectorType,
    FilterOperator,
    getApiSourceQueryIssues,
    SupportedDbtAdapter,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { buildApiSourceExplore } from '../apiSourceExplore';
import { compileMetaAdsQuery } from './metaAdsCompiler';
import {
    META_ADS_CAPABILITIES,
    META_ADS_MAX_QUERY_ROWS,
} from './MetaAdsConnector';
import {
    META_ADS_INSIGHTS_EXPLORE,
    META_ADS_SEMANTIC_LAYER_VERSION,
} from './metaAdsSemanticLayer';

const EXPLORE = 'meta_ads_insights';

const explore = buildApiSourceExplore({
    definition: META_ADS_INSIGHTS_EXPLORE,
    exploreName: EXPLORE,
    label: 'Meta Ads',
    connectionUuid: 'connection-uuid',
    integration: ApiConnectorType.META_ADS,
    baseVersion: META_ADS_SEMANTIC_LAYER_VERSION,
    capabilities: META_ADS_CAPABILITIES,
    warehouseSqlBuilder: warehouseSqlBuilderFromType(
        SupportedDbtAdapter.DUCKDB,
    ),
});

const field = (name: string) => `${EXPLORE}_${name}`;

const rule = (
    name: string,
    operator: FilterOperator,
    values: unknown[],
    settings?: FilterRule['settings'],
): FilterRule => ({
    id: `${name}-${operator}-${values.join(',')}`,
    target: { fieldId: field(name) },
    operator,
    values,
    ...(settings ? { settings } : {}),
});

const query = (overrides: Partial<MetricQuery> = {}): MetricQuery => ({
    exploreName: EXPLORE,
    dimensions: [field('campaign_name')],
    metrics: [field('spend')],
    filters: {},
    sorts: [],
    limit: 100,
    tableCalculations: [],
    ...overrides,
});

const compile = (metricQuery: MetricQuery, today = '2026-11-09') =>
    compileMetaAdsQuery({
        explore,
        metricQuery,
        today,
        maxRows: META_ADS_MAX_QUERY_ROWS,
    });

const request = (metricQuery: MetricQuery, today?: string) =>
    JSON.parse(compile(metricQuery, today).query);

const withFilters = (...rules: FilterRule[]) =>
    ({ filters: { dimensions: { id: 'root', and: rules } } }) as const;

describe('compileMetaAdsQuery', () => {
    it('reads the last 30 full days by default', () => {
        expect(request(query())).toMatchObject({
            time_range: { since: '2026-10-10', until: '2026-11-08' },
            time_increment: 'all_days',
            fields: ['campaign_name', 'spend'],
        });
    });

    it.each([
        ['no ad object', [], 'account'],
        ['a campaign', ['campaign_name'], 'campaign'],
        ['an objective', ['objective'], 'campaign'],
        ['an ad set', ['campaign_name', 'adset_name'], 'adset'],
        ['an ad', ['adset_id', 'ad_name'], 'ad'],
    ])('reads at the level of %s', (_name, dimensions, level) => {
        expect(
            request(query({ dimensions: dimensions.map(field) })).level,
        ).toBe(level);
    });

    it('keeps breakdowns apart from ad object fields', () => {
        const compiled = request(
            query({
                dimensions: [
                    field('campaign_name'),
                    field('age'),
                    field('gender'),
                ],
            }),
        );

        expect(compiled.fields).toEqual(['campaign_name', 'spend']);
        expect(compiled.breakdowns).toEqual(['age', 'gender']);
    });

    it('maps the day and month grains onto the time increment', () => {
        expect(
            request(query({ dimensions: [field('date')] })).time_increment,
        ).toBe(1);
        expect(
            request(query({ dimensions: [field('date_month')] }))
                .time_increment,
        ).toBe('monthly');
    });

    it('maps result columns back onto field ids', () => {
        const compiled = compile(
            query({
                dimensions: [field('date')],
                metrics: [field('purchases'), field('link_clicks')],
            }),
        );

        expect(compiled.fieldIdsByColumn).toEqual({
            date_start: field('date'),
            'actions:omni_purchase': field('purchases'),
            inline_link_clicks: field('link_clicks'),
        });
    });

    it('reads the date filter as the time range', () => {
        expect(
            request(
                query(
                    withFilters(
                        rule('date', FilterOperator.IN_BETWEEN, [
                            '2026-09-01',
                            '2026-09-07',
                        ]),
                    ),
                ),
            ).time_range,
        ).toEqual({ since: '2026-09-01', until: '2026-09-07' });
    });

    it.each([
        [
            'one equal value',
            FilterOperator.EQUALS,
            ['Spring'],
            [{ field: 'campaign.name', operator: 'EQUAL', value: 'Spring' }],
        ],
        [
            'several equal values',
            FilterOperator.EQUALS,
            ['Spring', 'Fall'],
            [
                {
                    field: 'campaign.name',
                    operator: 'IN',
                    value: ['Spring', 'Fall'],
                },
            ],
        ],
        [
            'one excluded value',
            FilterOperator.NOT_EQUALS,
            ['Spring'],
            [
                {
                    field: 'campaign.name',
                    operator: 'NOT_EQUAL',
                    value: 'Spring',
                },
            ],
        ],
        [
            'several excluded values',
            FilterOperator.NOT_EQUALS,
            ['Spring', 'Fall'],
            [
                {
                    field: 'campaign.name',
                    operator: 'NOT_IN',
                    value: ['Spring', 'Fall'],
                },
            ],
        ],
        [
            'contains',
            FilterOperator.INCLUDE,
            ['Spr'],
            [{ field: 'campaign.name', operator: 'CONTAIN', value: 'Spr' }],
        ],
        [
            'does not contain, for each value',
            FilterOperator.NOT_INCLUDE,
            ['Spr', 'Fal'],
            [
                {
                    field: 'campaign.name',
                    operator: 'NOT_CONTAIN',
                    value: 'Spr',
                },
                {
                    field: 'campaign.name',
                    operator: 'NOT_CONTAIN',
                    value: 'Fal',
                },
            ],
        ],
    ])('compiles %s into filters', (_name, operator, values, filtering) => {
        expect(
            request(query(withFilters(rule('campaign_name', operator, values))))
                .filtering,
        ).toEqual(filtering);
    });

    it('allows filters on an object the query groups by, or a coarser one', () => {
        expect(
            request(
                query({
                    dimensions: [field('ad_name')],
                    ...withFilters(
                        rule('campaign_id', FilterOperator.EQUALS, ['1']),
                    ),
                }),
            ).filtering,
        ).toEqual([{ field: 'campaign.id', operator: 'EQUAL', value: '1' }]);
    });

    it('refuses a filter finer than the grouping it would be totalled at', () => {
        expect(() =>
            request(
                query({
                    dimensions: [field('date')],
                    ...withFilters(
                        rule('campaign_name', FilterOperator.INCLUDE, ['Spr']),
                    ),
                }),
            ),
        ).toThrow(/Add ".*_campaign_name" to the dimensions/);
    });

    it('refuses several contains values', () => {
        expect(() =>
            request(
                query(
                    withFilters(
                        rule('campaign_name', FilterOperator.INCLUDE, [
                            'a',
                            'b',
                        ]),
                    ),
                ),
            ),
        ).toThrow(/one "contains" value/);
    });

    it('refuses a date grain mixed with another', () => {
        expect(() =>
            request(
                query({ dimensions: [field('date'), field('date_month')] }),
            ),
        ).toThrow(/one date grain per query/);
    });

    it('refuses a placement without its platform', () => {
        expect(() =>
            request(query({ dimensions: [field('platform_position')] })),
        ).toThrow(/Add Platform/);
        expect(
            request(
                query({
                    dimensions: [
                        field('publisher_platform'),
                        field('platform_position'),
                    ],
                }),
            ).breakdowns,
        ).toEqual(['publisher_platform', 'platform_position']);
    });

    it.each([['reach'], ['frequency']])(
        'refuses %s with a breakdown older than 13 months',
        (metric) => {
            expect(() =>
                request(
                    query({
                        dimensions: [field('country')],
                        metrics: [field(metric)],
                        ...withFilters(
                            rule('date', FilterOperator.IN_BETWEEN, [
                                '2025-09-01',
                                '2025-09-07',
                            ]),
                        ),
                    }),
                ),
            ).toThrow(/last 13 months/);
        },
    );

    it('lets reach use a breakdown within 13 months, or old dates without one', () => {
        const dates = rule('date', FilterOperator.IN_BETWEEN, [
            '2025-12-10',
            '2025-12-17',
        ]);
        expect(
            request(
                query({
                    dimensions: [field('country')],
                    metrics: [field('reach')],
                    ...withFilters(dates),
                }),
            ).breakdowns,
        ).toEqual(['country']);
        expect(
            request(
                query({
                    dimensions: [field('campaign_name')],
                    metrics: [field('reach')],
                    ...withFilters(
                        rule('date', FilterOperator.IN_BETWEEN, [
                            '2025-01-01',
                            '2025-01-07',
                        ]),
                    ),
                }),
            ).fields,
        ).toEqual(['campaign_name', 'reach']);
    });

    it('asks Meta to sort by one of its own metrics', () => {
        const compiled = compile(
            query({
                sorts: [{ fieldId: field('spend'), descending: true }],
                limit: 10,
            }),
        );

        expect(JSON.parse(compiled.query).sort).toEqual(['spend_descending']);
        expect(compiled.requestLimit).toBe(10);
        expect(compiled.localSorts).toEqual([]);
    });

    it.each([
        [
            'a dimension',
            [{ fieldId: field('campaign_name'), descending: false }],
        ],
        [
            'an action metric',
            [{ fieldId: field('purchases'), descending: true }],
        ],
        [
            'more than one field',
            [
                { fieldId: field('spend'), descending: true },
                { fieldId: field('campaign_name'), descending: false },
            ],
        ],
    ])('sorts %s after reading every row', (_name, sorts) => {
        const compiled = compile(query({ sorts, limit: 10 }));

        expect(JSON.parse(compiled.query).sort).toBeUndefined();
        expect(compiled.requestLimit).toBe(META_ADS_MAX_QUERY_ROWS);
        expect(compiled.limit).toBe(10);
        expect(compiled.localSorts).toEqual(sorts);
    });

    it('refuses a metric-less query', () => {
        expect(() => compile(query({ metrics: [] }))).toThrow(
            'Pick at least one Meta Ads metric',
        );
    });

    describe('shared check', () => {
        const issues = (metricQuery: MetricQuery) => {
            if (!explore.apiSource) throw new Error('Not a live explore');
            return getApiSourceQueryIssues(explore.apiSource, metricQuery).map(
                ({ code }) => code,
            );
        };

        it.each([
            ['age', 'country'],
            ['gender', 'publisher_platform'],
            ['country', 'publisher_platform'],
            ['country', 'region'],
        ])(
            "refuses %s with %s: Meta can't break them down together",
            (a, b) => {
                expect(
                    issues(query({ dimensions: [field(a), field(b)] })),
                ).toContain('live_source.refused.field_combination');
            },
        );

        it('allows the documented age and gender combination', () => {
            expect(
                issues(query({ dimensions: [field('age'), field('gender')] })),
            ).toEqual([]);
        });

        it("refuses filters on breakdowns, which Meta doesn't document", () => {
            expect(
                issues(
                    query(
                        withFilters(
                            rule('country', FilterOperator.EQUALS, ['US']),
                        ),
                    ),
                ),
            ).toContain('live_source.refused.filter_operator');
        });

        it('keeps a date filter from colliding with a date month grain', () => {
            expect(
                issues(
                    query({
                        dimensions: [field('date_month')],
                        ...withFilters(
                            rule('date', FilterOperator.IN_THE_PAST, [90]),
                        ),
                    }),
                ),
            ).toEqual([]);
        });
    });

    it('tags reach and frequency as non-additive', () => {
        const tags = Object.fromEntries(
            META_ADS_INSIGHTS_EXPLORE.metrics.map(({ name, aggregation }) => [
                name,
                aggregation?.aggregation,
            ]),
        );

        expect(tags).toMatchObject({
            reach: 'non_additive',
            frequency: 'non_additive',
            spend: 'additive',
            impressions: 'additive',
            ctr: 'ratio',
        });
    });
});
