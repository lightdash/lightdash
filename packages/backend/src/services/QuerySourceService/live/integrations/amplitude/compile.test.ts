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
import { amplitudeIntegration } from '.';
import { compileLiveMetricQuery } from '../../explores/build';
import {
    buildLiveExplore,
    type LiveExploreDefinition,
} from '../../explores/definition';
import { compileAmplitudeQuery } from './compile';
import {
    AMPLITUDE_EVENTS_EXPLORE,
    AMPLITUDE_FUNNEL_EXPLORE,
    AMPLITUDE_RETENTION_EXPLORE,
    AMPLITUDE_SESSIONS_EXPLORE,
    AMPLITUDE_USERS_EXPLORE,
} from './model';

const TODAY = '2026-11-09';

const build = (definition: LiveExploreDefinition) => {
    const name = `amplitude_${definition.name}`;
    const explore = buildLiveExplore({
        definition,
        exploreName: name,
        label: 'Amplitude',
        connectionUuid: 'connection-uuid',
        integration: ApiConnectorType.AMPLITUDE,
        baseVersion: 1,
        capabilities: amplitudeIntegration.query.capabilities,
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
            compileAmplitudeQuery({ explore, metricQuery, today: TODAY }).query,
        );
    };
    return { explore, field, rule, query, compile };
};

const events = build(AMPLITUDE_EVENTS_EXPLORE);
const users = build(AMPLITUDE_USERS_EXPLORE);
const funnel = build(AMPLITUDE_FUNNEL_EXPLORE);
const retention = build(AMPLITUDE_RETENTION_EXPLORE);
const sessions = build(AMPLITUDE_SESSIONS_EXPLORE);

describe('compileAmplitudeQuery', () => {
    describe('events', () => {
        it('counts every event over the last 30 days without filters', () => {
            expect(events.compile(events.query([], ['event_count']))).toEqual({
                endpoint: 'segmentation',
                start: '2026-10-10',
                end: '2026-11-08',
                interval: null,
                events: ['_all'],
                metrics: ['totals'],
                groupBy: null,
            });
        });

        it('reads the filtered events per week, by a user property, with segments', () => {
            expect(
                events.compile(
                    events.query(
                        ['date_week', 'event_type', 'country'],
                        ['event_count', 'unique_users'],
                        [
                            events.rule('event_type', FilterOperator.EQUALS, [
                                'Sign Up',
                                'Purchase',
                            ]),
                            events.rule('platform', FilterOperator.NOT_EQUALS, [
                                'Web',
                            ]),
                            events.rule('date', FilterOperator.IN_BETWEEN, [
                                '2026-10-01',
                                '2026-10-31',
                            ]),
                        ],
                    ),
                ),
            ).toEqual({
                endpoint: 'segmentation',
                start: '2026-10-01',
                end: '2026-10-31',
                segments: [{ prop: 'platform', op: 'is not', values: ['Web'] }],
                interval: 7,
                events: ['Sign Up', 'Purchase'],
                metrics: ['totals', 'uniques'],
                groupBy: 'country',
            });
        });

        it('refuses several events unless they are kept apart', () => {
            expect(() =>
                events.compile(
                    events.query(
                        ['date'],
                        ['unique_users'],
                        [
                            events.rule('event_type', FilterOperator.EQUALS, [
                                'A',
                                'B',
                            ]),
                        ],
                    ),
                ),
            ).toThrow(/Add Event to the dimensions/);
        });

        it('refuses more event and metric pairs than one query may call', () => {
            expect(() =>
                events.compile(
                    events.query(
                        ['event_type'],
                        [
                            'event_count',
                            'unique_users',
                            'events_per_user',
                            'percent_of_active_users',
                        ],
                        [
                            events.rule('event_type', FilterOperator.EQUALS, [
                                'A',
                                'B',
                                'C',
                                'D',
                                'E',
                                'F',
                            ]),
                        ],
                    ),
                ),
            ).toThrow(/at most 20 pairs/);
        });

        it('refuses two user properties and two date grains', () => {
            expect(() =>
                events.compile(
                    events.query(['country', 'platform'], ['event_count']),
                ),
            ).toThrow(/one user property at a time/);
            expect(() =>
                events.compile(
                    events.query(['date', 'date_month'], ['event_count']),
                ),
            ).toThrow(/one date grain per query/);
        });

        it('maps each column to its field through compileLiveMetricQuery', () => {
            const compiled = compileLiveMetricQuery({
                explore: events.explore,
                metricQuery: events.query(
                    ['date_month', 'event_type'],
                    ['events_per_user'],
                ),
                timezone: 'UTC',
                now: new Date(`${TODAY}T12:00:00Z`),
            });
            expect(compiled.fieldIdsByColumn).toEqual({
                month: events.field('date_month'),
                event_type: events.field('event_type'),
                events_per_user: events.field('events_per_user'),
            });
            expect(compiled.requestLimit).toBe(500);
        });
    });

    describe('users', () => {
        it('reads active and new users by month and country', () => {
            expect(
                users.compile(
                    users.query(
                        ['date_month', 'country'],
                        ['active_users', 'new_users'],
                    ),
                ),
            ).toMatchObject({
                endpoint: 'users',
                interval: 30,
                metrics: ['active', 'new'],
                groupBy: 'country',
            });
        });

        it('needs a date grain', () => {
            expect(() =>
                users.compile(users.query(['country'], ['active_users'])),
            ).toThrow(/Add Date, Date week or Date month/);
        });
    });

    describe('funnel', () => {
        it('reads the step filter as the ordered steps', () => {
            expect(
                funnel.compile(
                    funnel.query(
                        ['step_number', 'step_event'],
                        ['users', 'conversion_rate'],
                        [
                            funnel.rule('step_event', FilterOperator.EQUALS, [
                                'Sign Up',
                                'Complete Onboarding',
                                'Create Project',
                            ]),
                            funnel.rule(
                                'conversion_window_days',
                                FilterOperator.EQUALS,
                                [14],
                            ),
                            funnel.rule('country', FilterOperator.EQUALS, [
                                'Spain',
                            ]),
                        ],
                    ),
                ),
            ).toEqual({
                endpoint: 'funnel',
                start: '2026-10-10',
                end: '2026-11-08',
                segments: [{ prop: 'country', op: 'is', values: ['Spain'] }],
                steps: ['Sign Up', 'Complete Onboarding', 'Create Project'],
                conversionWindowDays: 14,
            });
        });

        it('needs at least two steps', () => {
            expect(() =>
                funnel.compile(funnel.query(['step_number'], ['users'])),
            ).toThrow(/from 2 to 10 events/);
        });

        it('refuses grouping by a filter-only field', () => {
            expect(() =>
                funnel.compile(
                    funnel.query(
                        ['country'],
                        ['users'],
                        [
                            funnel.rule('step_event', FilterOperator.EQUALS, [
                                'A',
                                'B',
                            ]),
                        ],
                    ),
                ),
            ).toThrow(/only filters a funnel/);
        });
    });

    describe('retention', () => {
        it('reads weekly cohorts of new users by default', () => {
            expect(
                retention.compile(
                    retention.query(
                        ['cohort_week', 'weeks_after'],
                        ['retention_rate'],
                    ),
                ),
            ).toEqual({
                endpoint: 'retention',
                start: '2026-10-10',
                end: '2026-11-08',
                interval: 7,
                startEvent: '_new',
                returnEvent: '_active',
                byCohort: true,
            });
        });

        it('reads the combined curve of chosen events without a cohort', () => {
            expect(
                retention.compile(
                    retention.query(
                        ['days_after'],
                        ['retained_users'],
                        [
                            retention.rule(
                                'start_event',
                                FilterOperator.EQUALS,
                                ['Create Dashboard'],
                            ),
                            retention.rule(
                                'return_event',
                                FilterOperator.EQUALS,
                                ['View Dashboard'],
                            ),
                        ],
                    ),
                ),
            ).toMatchObject({
                interval: 1,
                startEvent: 'Create Dashboard',
                returnEvent: 'View Dashboard',
                byCohort: false,
            });
        });

        it('needs one period that matches the cohort grain', () => {
            expect(() =>
                retention.compile(
                    retention.query(['cohort'], ['retention_rate']),
                ),
            ).toThrow(/Days, Weeks or Months after start/);
            expect(() =>
                retention.compile(
                    retention.query(
                        ['cohort_month', 'days_after'],
                        ['retention_rate'],
                    ),
                ),
            ).toThrow(/Match the cohort grain/);
        });
    });

    describe('sessions', () => {
        it('reads both session reports per day', () => {
            expect(
                sessions.compile(
                    sessions.query(
                        ['date'],
                        ['average_session_length_seconds', 'sessions_per_user'],
                    ),
                ),
            ).toEqual({
                endpoint: 'sessions',
                start: '2026-10-10',
                end: '2026-11-08',
                metrics: ['average', 'peruser'],
            });
        });

        it('needs the date', () => {
            expect(() =>
                sessions.compile(sessions.query([], ['sessions_per_user'])),
            ).toThrow(/Add Date/);
        });
    });
});
