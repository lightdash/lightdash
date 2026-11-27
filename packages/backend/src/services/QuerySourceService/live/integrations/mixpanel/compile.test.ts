import {
    ApiConnectorType,
    FilterOperator,
    getApiSourceQueryIssues,
    getItemMap,
    ParameterError,
    SupportedDbtAdapter,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { mixpanelIntegration } from '.';
import { compileLiveMetricQuery } from '../../explores/build';
import {
    buildLiveExplore,
    type LiveExploreDefinition,
} from '../../explores/definition';
import { compileMixpanelQuery } from './compile';
import {
    MIXPANEL_EVENTS_EXPLORE,
    MIXPANEL_FUNNEL_EXPLORE,
    MIXPANEL_RETENTION_EXPLORE,
    MIXPANEL_TOP_EVENTS_EXPLORE,
} from './explores';

const TODAY = '2026-11-09';

const build = (definition: LiveExploreDefinition) => {
    const name = `mixpanel_${definition.name}`;
    const explore = buildLiveExplore({
        definition,
        exploreName: name,
        label: 'Mixpanel',
        connectionUuid: 'connection-uuid',
        integration: ApiConnectorType.MIXPANEL,
        baseVersion: 1,
        capabilities: mixpanelIntegration.query.capabilities,
        warehouseSqlBuilder: warehouseSqlBuilderFromType(
            SupportedDbtAdapter.DUCKDB,
        ),
    });
    const field = (fieldName: string) => `${name}_${fieldName}`;
    const rule = (
        fieldName: string,
        operator: FilterOperator,
        values: unknown[],
    ): FilterRule => ({
        id: `${fieldName}-${operator}-${values.join(',')}`,
        target: { fieldId: field(fieldName) },
        operator,
        values,
    });
    const query = (
        dimensions: string[],
        metrics: string[],
        rules: FilterRule[] = [],
    ): MetricQuery => ({
        exploreName: name,
        dimensions: dimensions.map(field),
        metrics: metrics.map(field),
        filters:
            rules.length > 0 ? { dimensions: { id: 'root', and: rules } } : {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    });
    const compile = (metricQuery: MetricQuery) => {
        const issues = getApiSourceQueryIssues(
            explore.apiSource!,
            metricQuery,
            { itemsMap: getItemMap(explore) },
        );
        if (issues.length > 0) {
            throw new ParameterError(
                issues.map(({ message }) => message).join(' '),
            );
        }
        return JSON.parse(
            compileMixpanelQuery({ explore, metricQuery, today: TODAY }).query,
        );
    };
    return { explore, field, rule, query, compile };
};

const topEvents = build(MIXPANEL_TOP_EVENTS_EXPLORE);
const events = build(MIXPANEL_EVENTS_EXPLORE);
const funnel = build(MIXPANEL_FUNNEL_EXPLORE);
const retention = build(MIXPANEL_RETENTION_EXPLORE);

const signUp = events.rule('event', FilterOperator.EQUALS, ['Sign Up']);

describe('compileMixpanelQuery', () => {
    it("reads today's top events without filters", () => {
        expect(
            topEvents.compile(topEvents.query(['event'], ['event_count'])),
        ).toEqual({ endpoint: 'top_events' });
    });

    describe('events', () => {
        it('totals one event over the last 30 days', () => {
            expect(
                events.compile(events.query([], ['event_count'], [signUp])),
            ).toEqual({
                endpoint: 'segmentation',
                start: '2026-10-10',
                end: '2026-11-08',
                unit: null,
                events: ['Sign Up'],
                metrics: ['general'],
                groupBy: null,
                filters: [],
            });
        });

        it('reads the filtered events per month, split by a property, with filters', () => {
            expect(
                events.compile(
                    events.query(
                        ['date_month', 'event', 'country'],
                        ['event_count', 'unique_users'],
                        [
                            events.rule('event', FilterOperator.EQUALS, [
                                'Sign Up',
                                'Purchase',
                            ]),
                            events.rule('browser', FilterOperator.NOT_EQUALS, [
                                'Safari',
                            ]),
                            events.rule('date', FilterOperator.IN_BETWEEN, [
                                '2026-09-01',
                                '2026-10-31',
                            ]),
                        ],
                    ),
                ),
            ).toEqual({
                endpoint: 'segmentation',
                start: '2026-09-01',
                end: '2026-10-31',
                unit: 'month',
                events: ['Sign Up', 'Purchase'],
                metrics: ['general', 'unique'],
                groupBy: 'country',
                filters: [
                    { property: 'browser', op: 'is not', values: ['Safari'] },
                ],
            });
        });

        it('refuses a query without an event filter', () => {
            expect(() =>
                events.compile(events.query(['date'], ['event_count'])),
            ).toThrow(/Filter Event to the events to count/);
        });

        it('refuses more event and metric pairs than one query may call', () => {
            expect(() =>
                events.compile(
                    events.query(
                        ['event'],
                        ['event_count', 'unique_users', 'events_per_user'],
                        [
                            events.rule('event', FilterOperator.EQUALS, [
                                'A',
                                'B',
                                'C',
                            ]),
                        ],
                    ),
                ),
            ).toThrow(/at most 6 pairs/);
        });

        it('refuses two properties and two date grains', () => {
            expect(() =>
                events.compile(
                    events.query(['country', 'os'], ['event_count'], [signUp]),
                ),
            ).toThrow(/one property at a time/);
            expect(() =>
                events.compile(
                    events.query(
                        ['date', 'date_month'],
                        ['event_count'],
                        [signUp],
                    ),
                ),
            ).toThrow(/one date grain per query/);
        });

        it('maps each column to its field through compileLiveMetricQuery', () => {
            const compiled = compileLiveMetricQuery({
                explore: events.explore,
                metricQuery: events.query(
                    ['date_month', 'event', 'utm_source'],
                    ['events_per_user'],
                    [signUp],
                ),
                timezone: 'UTC',
                now: new Date(`${TODAY}T12:00:00Z`),
            });
            expect(compiled.fieldIdsByColumn).toEqual({
                month: events.field('date_month'),
                event: events.field('event'),
                utm_source: events.field('utm_source'),
                events_per_user: events.field('events_per_user'),
            });
        });
    });

    describe('funnel', () => {
        it('reads a saved funnel over the date range', () => {
            expect(
                funnel.compile(
                    funnel.query(
                        ['step_number', 'step_event'],
                        ['users', 'conversion_rate'],
                        [
                            funnel.rule(
                                'funnel_id',
                                FilterOperator.EQUALS,
                                [7_654_321],
                            ),
                            funnel.rule('date', FilterOperator.IN_BETWEEN, [
                                '2026-10-01',
                                '2026-10-31',
                            ]),
                        ],
                    ),
                ),
            ).toEqual({
                endpoint: 'funnel',
                start: '2026-10-01',
                end: '2026-10-31',
                funnelId: 7_654_321,
            });
        });

        it('refuses a funnel without one saved funnel id', () => {
            expect(() =>
                funnel.compile(funnel.query(['step_number'], ['users'])),
            ).toThrow(/Filter Funnel ID to one saved funnel/);
            expect(() =>
                funnel.compile(
                    funnel.query(
                        ['step_number'],
                        ['users'],
                        [
                            funnel.rule(
                                'funnel_id',
                                FilterOperator.EQUALS,
                                [1, 2],
                            ),
                        ],
                    ),
                ),
            ).toThrow(/Filter Funnel ID to one saved funnel/);
        });
    });

    describe('retention', () => {
        it('reads first-time retention per weekly cohort', () => {
            expect(
                retention.compile(
                    retention.query(
                        ['cohort_week', 'weeks_after'],
                        ['retained_users', 'retention_rate'],
                        [
                            retention.rule(
                                'start_event',
                                FilterOperator.EQUALS,
                                ['Sign Up'],
                            ),
                        ],
                    ),
                ),
            ).toEqual({
                endpoint: 'retention',
                start: '2026-10-10',
                end: '2026-11-08',
                unit: 'week',
                startEvent: 'Sign Up',
                returnEvent: null,
            });
        });

        it('refuses retention without a period, a cohort, or with mismatched grains', () => {
            expect(() =>
                retention.compile(
                    retention.query(['cohort'], ['retained_users']),
                ),
            ).toThrow(/Add one of Days, Weeks or Months after start/);
            expect(() =>
                retention.compile(
                    retention.query(['days_after'], ['retained_users']),
                ),
            ).toThrow(/Add the cohort date at the same grain/);
            expect(() =>
                retention.compile(
                    retention.query(
                        ['cohort_month', 'weeks_after'],
                        ['retained_users'],
                    ),
                ),
            ).toThrow(/Match the cohort grain/);
        });

        it('refuses a cohort range that needs more periods than Mixpanel reads', () => {
            const cohorts = (end: string) =>
                retention.query(
                    ['cohort_week', 'weeks_after'],
                    ['retained_users'],
                    [
                        retention.rule('cohort', FilterOperator.IN_BETWEEN, [
                            '2025-11-01',
                            end,
                        ]),
                    ],
                );
            // Mixpanel reads at most 52 weeks after start: the week of 27 Oct 2025 reaches 26 Oct 2026
            expect(retention.compile(cohorts('2026-11-01'))).toMatchObject({
                unit: 'week',
            });
            expect(() => retention.compile(cohorts('2026-11-02'))).toThrow(
                /Shorten the cohort date range: Mixpanel reads at most 52 weeks after start, and this range needs 53/,
            );
        });
    });
});
