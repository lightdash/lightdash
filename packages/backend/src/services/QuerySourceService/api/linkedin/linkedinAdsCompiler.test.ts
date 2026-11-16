import {
    ApiConnectorType,
    FilterOperator,
    SupportedDbtAdapter,
    type FilterRule,
    type MetricQuery,
    type ParameterError,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { buildApiSourceExplore } from '../apiSourceExplore';
import { compileLinkedInAdsQuery } from './linkedinAdsCompiler';
import {
    LINKEDIN_ADS_CAPABILITIES,
    LINKEDIN_ADS_MAX_QUERY_ROWS,
    LinkedInAdsConnector,
} from './LinkedInAdsConnector';
import {
    LINKEDIN_ADS_PERFORMANCE_EXPLORE,
    LINKEDIN_ADS_SEMANTIC_LAYER_VERSION,
} from './linkedinAdsSemanticLayer';

const EXPLORE = 'linkedin_performance';
const TODAY = '2026-11-09';

const explore = buildApiSourceExplore({
    definition: LINKEDIN_ADS_PERFORMANCE_EXPLORE,
    exploreName: EXPLORE,
    label: 'LinkedIn',
    connectionUuid: 'connection-uuid',
    integration: ApiConnectorType.LINKEDIN_ADS,
    baseVersion: LINKEDIN_ADS_SEMANTIC_LAYER_VERSION,
    capabilities: LINKEDIN_ADS_CAPABILITIES,
    warehouseSqlBuilder: warehouseSqlBuilderFromType(
        SupportedDbtAdapter.DUCKDB,
    ),
});

const field = (name: string) => `${EXPLORE}_${name}`;

const rule = (
    name: string,
    operator: FilterOperator,
    values: unknown[],
): FilterRule => ({
    id: `${name}-${operator}`,
    target: { fieldId: field(name) },
    operator,
    values,
});

const query = (overrides: Partial<MetricQuery> = {}): MetricQuery => ({
    exploreName: EXPLORE,
    dimensions: [field('campaign_name')],
    metrics: [field('impressions')],
    filters: {},
    sorts: [],
    limit: 100,
    tableCalculations: [],
    ...overrides,
});

const filtered = (...rules: FilterRule[]): Partial<MetricQuery> => ({
    filters: { dimensions: { id: 'root', and: rules } },
});

const compile = (metricQuery: MetricQuery) => {
    const compiled = compileLinkedInAdsQuery({
        explore,
        metricQuery,
        today: TODAY,
    });
    return { ...compiled, request: JSON.parse(compiled.query) };
};

const between = (start: string, end: string) =>
    filtered(rule('date', FilterOperator.IN_BETWEEN, [start, end]));

describe('compileLinkedInAdsQuery', () => {
    it('compiles a campaign report over the last 28 days', () => {
        const { request, fieldIdsByColumn } = compile(query());
        expect(request).toEqual({
            pivot: 'CAMPAIGN',
            timeGranularity: 'ALL',
            dateRange: { start: '2026-10-12', end: '2026-11-08' },
            fields: ['impressions'],
            dimensions: ['campaign.name'],
        });
        expect(fieldIdsByColumn).toEqual({
            'campaign.name': field('campaign_name'),
            impressions: field('impressions'),
        });
    });

    it.each([
        [[], 'ACCOUNT'],
        [['campaign_group_name'], 'CAMPAIGN_GROUP'],
        [['campaign_group_name', 'campaign_id'], 'CAMPAIGN'],
        [['date'], 'ACCOUNT'],
    ])('pivots %j on %s', (names, pivot) => {
        expect(
            compile(query({ dimensions: names.map(field) })).request.pivot,
        ).toBe(pivot);
    });

    it.each([
        ['date', 'DAILY'],
        ['date_month', 'MONTHLY'],
        ['date_year', 'YEARLY'],
    ])('groups %s by %s', (name, granularity) => {
        expect(
            compile(query({ dimensions: [field(name)] })).request
                .timeGranularity,
        ).toBe(granularity);
    });

    it('refuses two date grains', () => {
        expect(() =>
            compile(
                query({ dimensions: [field('date'), field('date_month')] }),
            ),
        ).toThrow('one date grain');
    });

    it('turns ID filters into facets', () => {
        expect(
            compile(
                query({
                    dimensions: [field('campaign_id')],
                    ...filtered(
                        rule('campaign_id', FilterOperator.EQUALS, ['1', '2']),
                        rule('campaign_group_id', FilterOperator.EQUALS, ['9']),
                    ),
                }),
            ).request,
        ).toMatchObject({ campaigns: ['1', '2'], campaignGroups: ['9'] });
    });

    it('refuses filters finer than the selection and bad IDs', () => {
        expect(() =>
            compile(
                query({
                    dimensions: [field('date')],
                    ...filtered(
                        rule('campaign_id', FilterOperator.EQUALS, ['1']),
                    ),
                }),
            ),
        ).toThrow('to filter by it');
        expect(() =>
            compile(
                query({
                    ...filtered(
                        rule('campaign_id', FilterOperator.EQUALS, ['abc']),
                    ),
                }),
            ),
        ).toThrow("isn't a LinkedIn numeric ID");
    });

    describe('row identity', () => {
        it.each([
            [
                ['campaign_type'],
                'campaign_type',
                /one row per campaign and can't group them by Campaign type\. Add Campaign name or Campaign ID/,
            ],
            [
                ['campaign_status'],
                'campaign_status',
                /one row per campaign .* Campaign status/,
            ],
            [
                ['campaign_objective', 'date'],
                'campaign_objective',
                /one row per campaign/,
            ],
            [
                ['campaign_group_name', 'campaign_status'],
                'campaign_status',
                /one row per campaign/,
            ],
        ])('refuses grouping by %j', (dimensions, fieldName, message) => {
            const error = (() => {
                try {
                    compile(query({ dimensions: dimensions.map(field) }));
                    return null;
                } catch (e) {
                    return e as ParameterError;
                }
            })();
            expect(error?.message).toMatch(message);
            expect(error?.data).toMatchObject({
                liveSourceErrorCode: 'live_source.refused.field_combination',
                liveSourceFieldIds: [field(fieldName)],
            });
        });

        it.each([
            [['campaign_type', 'campaign_id']],
            [['campaign_status', 'campaign_name']],
            [['campaign_group_name']],
            [['campaign_group_id', 'campaign_group_name']],
            [['date']],
        ])('allows grouping by %j', (dimensions) => {
            expect(() =>
                compile(query({ dimensions: dimensions.map(field) })),
            ).not.toThrow();
        });

        it('returns one row per campaign when an ID is selected with the type', async () => {
            const { query: request, fieldIdsByColumn } = compile(
                query({
                    dimensions: [field('campaign_type'), field('campaign_id')],
                    metrics: [field('clicks')],
                }),
            );
            const connector = new LinkedInAdsConnector({
                adAccountId: '1',
                send: async ({ path }) => ({
                    status: 200,
                    headers: {},
                    body: path.endsWith('/adCampaigns')
                        ? {
                              elements: [
                                  { id: 11, type: 'SPONSORED_UPDATES' },
                                  { id: 12, type: 'SPONSORED_UPDATES' },
                              ],
                          }
                        : {
                              elements: [
                                  {
                                      pivotValues: [
                                          'urn:li:sponsoredCampaign:11',
                                      ],
                                      clicks: 3,
                                  },
                                  {
                                      pivotValues: [
                                          'urn:li:sponsoredCampaign:12',
                                      ],
                                      clicks: 4,
                                  },
                              ],
                          },
                }),
            });
            const { rows } = await connector.execute({
                payload: { kind: 'query', query: request },
                limit: 10,
            });
            expect(
                rows.map((row) =>
                    Object.fromEntries(
                        Object.entries(row).map(([column, value]) => [
                            fieldIdsByColumn[column],
                            value,
                        ]),
                    ),
                ),
            ).toEqual([
                {
                    [field('campaign_type')]: 'SPONSORED_UPDATES',
                    [field('campaign_id')]: '11',
                    [field('clicks')]: 3,
                },
                {
                    [field('campaign_type')]: 'SPONSORED_UPDATES',
                    [field('campaign_id')]: '12',
                    [field('clicks')]: 4,
                },
            ]);
        });
    });

    it('refuses reach over 92 days and accepts exactly 92', () => {
        const reach = { metrics: [field('reach')] };
        expect(() =>
            compile(
                query({ ...reach, ...between('2026-07-01', '2026-10-01') }),
            ),
        ).toThrow('at most 92 days');
        expect(
            compile(query({ ...reach, ...between('2026-07-01', '2026-09-30') }))
                .request.dateRange,
        ).toEqual({ start: '2026-07-01', end: '2026-09-30' });
    });

    describe('totals older than six months', () => {
        it('refuses ranges LinkedIn would round to whole months', () => {
            expect(() =>
                compile(query(between('2026-01-15', '2026-03-31'))),
            ).toThrow('rounds totals older than six months');
        });

        it('accepts whole months and any range with a date breakdown', () => {
            expect(
                compile(query(between('2026-01-01', '2026-03-31'))).request
                    .dateRange.start,
            ).toBe('2026-01-01');
            expect(
                compile(
                    query({
                        dimensions: [field('date')],
                        ...between('2026-01-15', '2026-03-20'),
                    }),
                ).request.timeGranularity,
            ).toBe('DAILY');
        });
    });

    it('produces a request the connector accepts and maps back to fields', async () => {
        const { query: request, fieldIdsByColumn } = compile(
            query({
                dimensions: [field('date_month'), field('campaign_id')],
                metrics: [field('cost')],
                ...filtered(rule('campaign_id', FilterOperator.EQUALS, ['11'])),
            }),
        );
        const connector = new LinkedInAdsConnector({
            adAccountId: '1',
            send: async () => ({
                status: 200,
                headers: {},
                body: {
                    elements: [
                        {
                            pivotValues: ['urn:li:sponsoredCampaign:11'],
                            dateRange: {
                                start: { year: 2026, month: 10, day: 1 },
                            },
                            costInLocalCurrency: '4.50',
                        },
                    ],
                },
            }),
        });
        const { rows } = await connector.execute({
            payload: { kind: 'query', query: request },
            limit: 10,
        });
        expect(
            Object.fromEntries(
                Object.entries(rows[0]).map(([column, value]) => [
                    fieldIdsByColumn[column],
                    value,
                ]),
            ),
        ).toEqual({
            [field('date_month')]: '2026-10-01',
            [field('campaign_id')]: '11',
            [field('cost')]: 4.5,
        });
    });

    it('sorts on the returned rows, reading them all', () => {
        const sorts = [{ fieldId: field('impressions'), descending: true }];
        const { requestLimit, localSorts } = compile(
            query({ sorts, limit: 10 }),
        );
        expect(requestLimit).toBe(LINKEDIN_ADS_MAX_QUERY_ROWS);
        expect(localSorts).toEqual(sorts);
    });
});
