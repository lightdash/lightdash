import {
    ApiConnectorType,
    FilterOperator,
    ParameterError,
    SupportedDbtAdapter,
    UnitOfTime,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { buildApiSourceExplore } from '../apiSourceExplore';
import { compileYoutubeAnalyticsQuery } from './youtubeAnalyticsCompiler';
import {
    YOUTUBE_ANALYTICS_CAPABILITIES,
    YoutubeAnalyticsConnector,
} from './YoutubeAnalyticsConnector';
import {
    YOUTUBE_ANALYTICS_ACTIVITY_EXPLORE,
    YOUTUBE_ANALYTICS_SEMANTIC_LAYER_VERSION,
} from './youtubeAnalyticsSemanticLayer';

const EXPLORE = 'youtube_activity';
const TODAY = '2026-11-09';

const explore = buildApiSourceExplore({
    definition: YOUTUBE_ANALYTICS_ACTIVITY_EXPLORE,
    exploreName: EXPLORE,
    label: 'Channel',
    connectionUuid: 'connection-uuid',
    integration: ApiConnectorType.YOUTUBE_ANALYTICS,
    baseVersion: YOUTUBE_ANALYTICS_SEMANTIC_LAYER_VERSION,
    capabilities: YOUTUBE_ANALYTICS_CAPABILITIES,
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
    id: `${name}-${operator}`,
    target: { fieldId: field(name) },
    operator,
    values,
    ...(settings ? { settings } : {}),
});

const query = (overrides: Partial<MetricQuery> = {}): MetricQuery => ({
    exploreName: EXPLORE,
    dimensions: [field('date')],
    metrics: [field('views')],
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
    const compiled = compileYoutubeAnalyticsQuery({
        explore,
        metricQuery,
        today: TODAY,
    });
    return { ...compiled, request: JSON.parse(compiled.query) };
};

describe('compileYoutubeAnalyticsQuery', () => {
    it('reads the last 28 days by day and maps columns to fields', () => {
        const { request, fieldIdsByColumn, localSorts } = compile(query());
        expect(request).toEqual({
            startDate: '2026-10-12',
            endDate: '2026-11-08',
            metrics: 'views',
            dimensions: 'day',
            maxResults: 100,
        });
        expect(fieldIdsByColumn).toEqual({
            day: field('date'),
            views: field('views'),
        });
        expect(localSorts).toEqual([]);
    });

    it('produces a request the connector accepts and maps back to fields', async () => {
        const { query: request, fieldIdsByColumn } = compile(query());
        const connector = new YoutubeAnalyticsConnector({
            channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa',
            send: async () => ({
                status: 200,
                headers: {},
                body: {
                    columnHeaders: [
                        { name: 'day', columnType: 'DIMENSION' },
                        { name: 'views', columnType: 'METRIC' },
                    ],
                    rows: [['2026-10-12', 5]],
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
        ).toEqual({ [field('date')]: '2026-10-12', [field('views')]: 5 });
    });

    it('sends totals without dimensions and asks for views when no metric is picked', () => {
        expect(
            compile(query({ dimensions: [], metrics: [field('likes')] }))
                .request,
        ).toMatchObject({ metrics: 'likes' });
        expect(
            compile(query({ metrics: [], dimensions: [field('country')] }))
                .request,
        ).toMatchObject({ metrics: 'views', dimensions: 'country' });
    });

    it.each([
        [['device_type'], 'deviceType'],
        [['device_type', 'date'], 'deviceType,day'],
        [['traffic_source_type', 'date'], 'insightTrafficSourceType,day'],
        [['country', 'creator_content_type'], 'country,creatorContentType'],
    ])('accepts the documented report %j', (names, dimensions) => {
        expect(
            compile(query({ dimensions: names.map(field) })).request.dimensions,
        ).toBe(dimensions);
    });

    it.each([
        [['country', 'date'], 'no report for country with day'],
        [['device_type', 'date_month'], 'no report for deviceType with month'],
        [['video_id', 'date'], 'no report for video with day'],
        [['date', 'date_month'], 'Pick one date grain'],
        [['creator_content_type'], 'break down by content type'],
    ])('refuses the undocumented combination %j', (names, message) => {
        expect(() => compile(query({ dimensions: names.map(field) }))).toThrow(
            message,
        );
    });

    it('builds equals filters, several videos in one', () => {
        expect(
            compile(
                query(
                    filtered(
                        rule('country', FilterOperator.EQUALS, ['US']),
                        rule('video_id', FilterOperator.EQUALS, ['a1', 'b_2']),
                    ),
                ),
            ).request.filters,
        ).toBe('country==US;video==a1,b_2');
    });

    it('refuses filter values that could smuggle another filter', () => {
        expect(() =>
            compile(
                query(
                    filtered(
                        rule('video_id', FilterOperator.EQUALS, [
                            'a;channel==UCother',
                        ]),
                    ),
                ),
            ),
        ).toThrow(ParameterError);
        expect(() =>
            compile(
                query(
                    filtered(rule('country', FilterOperator.EQUALS, ['us;x'])),
                ),
            ),
        ).toThrow("isn't a two-letter country code");
    });

    it('refuses several countries and filtering a selected dimension', () => {
        expect(() =>
            compile(
                query(
                    filtered(
                        rule('country', FilterOperator.EQUALS, ['US', 'DE']),
                    ),
                ),
            ),
        ).toThrow('one country at a time');
        expect(() =>
            compile(
                query({
                    dimensions: [field('country')],
                    ...filtered(rule('country', FilterOperator.EQUALS, ['US'])),
                }),
            ),
        ).toThrow('while also breaking down by it');
    });

    describe('months', () => {
        const month = (overrides: Partial<MetricQuery> = {}) =>
            query({ dimensions: [field('date_month')], ...overrides });

        it('defaults to the last 12 complete months', () => {
            expect(compile(month()).request).toMatchObject({
                startDate: '2025-11-01',
                endDate: '2026-10-01',
            });
        });

        it('sends whole-month ranges with both bounds on the first', () => {
            expect(
                compile(
                    month(
                        filtered(
                            rule('date', FilterOperator.IN_BETWEEN, [
                                '2026-01-01',
                                '2026-03-31',
                            ]),
                        ),
                    ),
                ).request,
            ).toMatchObject({ startDate: '2026-01-01', endDate: '2026-03-01' });
        });

        it('accepts the current month, which ends today', () => {
            expect(
                compile(
                    month(
                        filtered(
                            rule('date', FilterOperator.IN_THE_CURRENT, [], {
                                unitOfTime: UnitOfTime.months,
                            }),
                        ),
                    ),
                ).request,
            ).toMatchObject({ startDate: '2026-11-01', endDate: '2026-11-01' });
        });

        it.each([
            [['2026-01-15', '2026-03-31']],
            [['2026-01-01', '2026-03-15']],
        ])('refuses the partial months %j', (values) => {
            expect(() =>
                compile(
                    month(
                        filtered(
                            rule('date', FilterOperator.IN_BETWEEN, values),
                        ),
                    ),
                ),
            ).toThrow('whole months only');
        });
    });

    describe('top videos', () => {
        const videos = (overrides: Partial<MetricQuery> = {}) =>
            query({ dimensions: [field('video_id')], ...overrides });

        it('sorts by the requested metric, descending', () => {
            expect(
                compile(
                    videos({
                        metrics: [
                            field('views'),
                            field('estimated_minutes_watched'),
                        ],
                        sorts: [
                            {
                                fieldId: field('estimated_minutes_watched'),
                                descending: true,
                            },
                        ],
                    }),
                ).request.sort,
            ).toBe('-estimatedMinutesWatched');
        });

        it('falls back to a rankable metric when nothing is sorted', () => {
            expect(compile(videos()).request.sort).toBe('-views');
        });

        it('refuses a sort YouTube cannot rank by', () => {
            expect(() =>
                compile(videos({ metrics: [field('likes')] })),
            ).toThrow('YouTube ranks videos by');
            expect(() =>
                compile(
                    videos({
                        sorts: [{ fieldId: field('views'), descending: false }],
                    }),
                ),
            ).toThrow('highest to lowest');
        });
    });

    it('sends other sorts as given', () => {
        expect(
            compile(
                query({
                    sorts: [{ fieldId: field('date'), descending: false }],
                }),
            ).request.sort,
        ).toBe('day');
    });
});
