import {
    ApiConnectorType,
    FilterOperator,
    getApiSourceQueryIssues,
    getItemMap,
    ParameterError,
    SupportedDbtAdapter,
    UnitOfTime,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { sentryIntegration } from '.';
import { compileLiveMetricQuery } from '../../explores/build';
import {
    buildLiveExplore,
    type LiveExploreDefinition,
} from '../../explores/definition';
import { compileSentryQuery } from './compile';
import {
    SENTRY_ERRORS_EXPLORE,
    SENTRY_ISSUES_EXPLORE,
    SENTRY_SESSIONS_EXPLORE,
} from './model';
import { SENTRY_MAX_QUERY_ROWS } from './run';

const build = (definition: LiveExploreDefinition) =>
    buildLiveExplore({
        definition,
        exploreName: `sentry_${definition.name}`,
        label: 'Sentry',
        connectionUuid: 'connection-uuid',
        integration: ApiConnectorType.SENTRY,
        baseVersion: 1,
        capabilities: sentryIntegration.query.capabilities,
        warehouseSqlBuilder: warehouseSqlBuilderFromType(
            SupportedDbtAdapter.DUCKDB,
        ),
    });

const ERRORS = build(SENTRY_ERRORS_EXPLORE);
const ISSUES = build(SENTRY_ISSUES_EXPLORE);
const SESSIONS = build(SENTRY_SESSIONS_EXPLORE);

const rule = (
    fieldId: string,
    operator: FilterOperator,
    values: unknown[],
    settings?: FilterRule['settings'],
): FilterRule => ({
    id: `${fieldId}-${operator}-${values.join(',')}`,
    target: { fieldId },
    operator,
    values,
    ...(settings ? { settings } : {}),
});

const query = (
    exploreName: string,
    overrides: Partial<MetricQuery> = {},
): MetricQuery => ({
    exploreName,
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    limit: 100,
    tableCalculations: [],
    ...overrides,
});

const filters = (...rules: FilterRule[]): MetricQuery['filters'] => ({
    dimensions: { id: 'root', and: rules },
});

const compile = (
    explore: typeof ERRORS,
    metricQuery: MetricQuery,
    today = '2026-11-27',
) => {
    const { query: request, localSorts } = compileSentryQuery({
        explore,
        metricQuery,
        today,
    });
    return { request: JSON.parse(request), localSorts };
};

const error = (name: string) => `sentry_errors_${name}`;
const issue = (name: string) => `sentry_issues_${name}`;
const session = (name: string) => `sentry_sessions_${name}`;

describe('compileSentryQuery on errors', () => {
    it('counts issues by release for one project, sorted by Sentry', () => {
        const { request, localSorts } = compile(
            ERRORS,
            query('sentry_errors', {
                dimensions: [error('release')],
                metrics: [error('issues'), error('events')],
                filters: filters(
                    rule(error('project'), FilterOperator.EQUALS, [
                        'mobile-ios',
                    ]),
                ),
                sorts: [{ fieldId: error('issues'), descending: true }],
            }),
        );

        expect(request).toEqual({
            kind: 'errors',
            columns: ['release', 'issues', 'events'],
            // The last 30 full days
            start: '2026-10-28',
            end: '2026-11-26',
            filters: [
                { field: 'project', operator: 'is', values: ['mobile-ios'] },
            ],
            sort: { column: 'issues', descending: true },
        });
        expect(localSorts).toEqual([]);
    });

    it('reads the date filter as the range, today included', () => {
        const { request } = compile(
            ERRORS,
            query('sentry_errors', {
                dimensions: [error('date')],
                metrics: [error('events')],
                filters: filters(
                    rule(error('date'), FilterOperator.IN_THE_PAST, [7], {
                        unitOfTime: UnitOfTime.days,
                    }),
                ),
            }),
        );

        expect(request).toMatchObject({
            start: '2026-11-20',
            end: '2026-11-27',
        });
        expect(request.filters).toBeUndefined();
    });

    it('starts an open-ended range at the first day Sentry keeps', () => {
        const { request } = compile(
            ERRORS,
            query('sentry_errors', {
                metrics: [error('events')],
                filters: filters(
                    rule(error('date'), FilterOperator.LESS_THAN, [
                        '2026-11-01',
                    ]),
                ),
            }),
        );

        expect(request).toMatchObject({
            start: '2026-08-29',
            end: '2026-10-31',
        });
    });

    it('turns each filter operator into a Sentry filter', () => {
        const { request } = compile(
            ERRORS,
            query('sentry_errors', {
                metrics: [error('events')],
                filters: filters(
                    rule(error('level'), FilterOperator.NOT_EQUALS, [
                        'info',
                        'debug',
                    ]),
                    rule(error('title'), FilterOperator.INCLUDE, ['App Hang']),
                    rule(error('unhandled'), FilterOperator.EQUALS, [true]),
                ),
            }),
        );

        expect(request.filters).toEqual([
            { field: 'level', operator: 'is_not', values: ['info', 'debug'] },
            { field: 'title', operator: 'contains', values: ['App Hang'] },
            { field: 'unhandled', operator: 'is', values: ['true'] },
        ]);
    });

    it('sorts here when Sentry cannot: several sorts, a list column or the issue', () => {
        const several = [
            { fieldId: error('release'), descending: false },
            { fieldId: error('events'), descending: true },
        ];
        expect(
            compile(
                ERRORS,
                query('sentry_errors', {
                    dimensions: [error('release')],
                    metrics: [error('events')],
                    sorts: several,
                }),
            ),
        ).toMatchObject({ localSorts: several });

        const byType = [{ fieldId: error('error_type'), descending: false }];
        const { request, localSorts } = compile(
            ERRORS,
            query('sentry_errors', {
                dimensions: [error('error_type')],
                metrics: [error('events')],
                sorts: byType,
            }),
        );
        expect(request.sort).toBeUndefined();
        expect(localSorts).toEqual(byType);

        const byIssue = [{ fieldId: error('issue'), descending: false }];
        expect(
            compile(
                ERRORS,
                query('sentry_errors', {
                    dimensions: [error('issue')],
                    metrics: [error('events')],
                    sorts: byIssue,
                }),
            ).localSorts,
        ).toEqual(byIssue);
    });

    it('drops a sort on Issues when grouped by issue, where it is 1 on every row', () => {
        const dimensions = [error('release'), error('issue')];
        const metrics = [
            error('issues'),
            error('events'),
            error('users_affected'),
        ];
        const onlyIssues = compile(
            ERRORS,
            query('sentry_errors', {
                dimensions,
                metrics,
                sorts: [{ fieldId: error('issues'), descending: true }],
            }),
        );
        expect(onlyIssues.request.columns).toEqual([
            'release',
            'issue',
            'issues',
            'events',
            'users_affected',
        ]);
        expect(onlyIssues.request.sort).toBeUndefined();
        expect(onlyIssues.localSorts).toEqual([]);

        // The sort that is left is one Sentry can apply
        const thenEvents = compile(
            ERRORS,
            query('sentry_errors', {
                dimensions,
                metrics,
                sorts: [
                    { fieldId: error('issues'), descending: true },
                    { fieldId: error('events'), descending: true },
                ],
            }),
        );
        expect(thenEvents.request.sort).toEqual({
            column: 'events',
            descending: true,
        });
        expect(thenEvents.localSorts).toEqual([]);
    });

    it('keeps a sort on Issues by any other dimension', () => {
        const { request } = compile(
            ERRORS,
            query('sentry_errors', {
                dimensions: [error('title')],
                metrics: [error('issues')],
                sorts: [{ fieldId: error('issues'), descending: true }],
            }),
        );

        expect(request.sort).toEqual({ column: 'issues', descending: true });
    });

    it('reads every row it may when the sort is ours', () => {
        const compiled = compileLiveMetricQuery({
            explore: ERRORS,
            metricQuery: query('sentry_errors', {
                dimensions: [error('release'), error('level')],
                metrics: [error('events')],
                sorts: [
                    { fieldId: error('release'), descending: false },
                    { fieldId: error('events'), descending: true },
                ],
                limit: 10,
            }),
            timezone: 'UTC',
            now: new Date('2026-11-27T12:00:00Z'),
        });

        expect(compiled.requestLimit).toBe(SENTRY_MAX_QUERY_ROWS);
        expect(compiled.limit).toBe(10);
    });
});

describe('compileSentryQuery on issues', () => {
    it('lists new unresolved issues of a release, most users first', () => {
        const { request, localSorts } = compile(
            ISSUES,
            query('sentry_issues', {
                dimensions: [
                    issue('short_id'),
                    issue('title'),
                    issue('users'),
                    issue('first_seen'),
                ],
                filters: filters(
                    rule(issue('status'), FilterOperator.EQUALS, [
                        'unresolved',
                    ]),
                    rule(issue('release'), FilterOperator.EQUALS, ['1.0.7']),
                    rule(issue('first_seen'), FilterOperator.IN_BETWEEN, [
                        '2026-11-12',
                        '2026-11-20',
                    ]),
                ),
                sorts: [{ fieldId: issue('users'), descending: true }],
            }),
        );

        expect(request).toEqual({
            kind: 'issues',
            columns: ['short_id', 'title', 'users', 'first_seen'],
            filters: [
                { field: 'status', operator: 'is', values: ['unresolved'] },
                { field: 'release', operator: 'is', values: ['1.0.7'] },
            ],
            firstSeen: { start: '2026-11-12', end: '2026-11-20' },
            sort: 'user',
        });
        expect(localSorts).toEqual([]);
    });

    it('has no date range of its own', () => {
        const { request } = compile(
            ISSUES,
            query('sentry_issues', { dimensions: [issue('short_id')] }),
        );

        expect(request).toEqual({ kind: 'issues', columns: ['short_id'] });
    });

    it('sorts here when Sentry has no such order', () => {
        const ascending = [{ fieldId: issue('users'), descending: false }];
        const { request, localSorts } = compile(
            ISSUES,
            query('sentry_issues', {
                dimensions: [issue('short_id'), issue('users')],
                sorts: ascending,
            }),
        );

        expect(request.sort).toBeUndefined();
        expect(localSorts).toEqual(ascending);
    });

    it('refuses two filters on one issue date', () => {
        expect(() =>
            compile(
                ISSUES,
                query('sentry_issues', {
                    dimensions: [issue('short_id')],
                    filters: filters(
                        rule(issue('last_seen'), FilterOperator.GREATER_THAN, [
                            '2026-11-01',
                        ]),
                        rule(issue('last_seen'), FilterOperator.LESS_THAN, [
                            '2026-11-20',
                        ]),
                    ),
                }),
            ),
        ).toThrow(ParameterError);
    });
});

describe('compileSentryQuery on sessions', () => {
    it('reads crash-free rates by release, sorted here', () => {
        const sorts = [
            { fieldId: session('crash_free_sessions'), descending: false },
        ];
        const { request, localSorts } = compile(
            SESSIONS,
            query('sentry_sessions', {
                dimensions: [session('release')],
                metrics: [
                    session('crash_free_sessions'),
                    session('crash_free_users'),
                    session('sessions'),
                ],
                filters: filters(
                    rule(session('project'), FilterOperator.EQUALS, [
                        'mobile-ios',
                    ]),
                ),
                sorts,
            }),
        );

        expect(request).toEqual({
            kind: 'sessions',
            columns: [
                'release',
                'crash_free_sessions',
                'crash_free_users',
                'sessions',
            ],
            start: '2026-10-28',
            end: '2026-11-26',
            filters: [
                { field: 'project', operator: 'is', values: ['mobile-ios'] },
            ],
        });
        expect(localSorts).toEqual(sorts);
    });
});

describe('compileSentryQuery on a date the calendar does not have', () => {
    const cases: [string, typeof ERRORS, string, Partial<MetricQuery>][] = [
        ['errors', ERRORS, error('date'), { metrics: [error('events')] }],
        [
            'sessions',
            SESSIONS,
            session('date'),
            { metrics: [session('sessions')] },
        ],
        [
            'issues by First seen',
            ISSUES,
            issue('first_seen'),
            { dimensions: [issue('short_id')] },
        ],
        [
            'issues by Last seen',
            ISSUES,
            issue('last_seen'),
            { dimensions: [issue('short_id')] },
        ],
    ];
    const dateFilters: [FilterOperator, unknown[]][] = [
        [FilterOperator.GREATER_THAN, ['2026-02-30']],
        [FilterOperator.GREATER_THAN, ['2026-11-99']],
        [FilterOperator.GREATER_THAN_OR_EQUAL, ['2026-02-30']],
        [FilterOperator.LESS_THAN, ['2026-02-30']],
        [FilterOperator.LESS_THAN, ['2026-11-99']],
        [FilterOperator.LESS_THAN_OR_EQUAL, ['2026-11-31']],
        [FilterOperator.EQUALS, ['2026-02-30']],
        [FilterOperator.IN_BETWEEN, ['2026-02-01', '2026-02-30']],
        [FilterOperator.IN_BETWEEN, ['2026-02-30', '2026-03-10']],
        // A date with a time, as a date picker can send it
        [FilterOperator.GREATER_THAN, ['2026-02-30T00:00:00Z']],
    ];

    describe.each(cases)('%s', (_, explore, fieldId, overrides) => {
        it.each(dateFilters)('refuses "%s" %j', (operator, values) => {
            const compileIt = () =>
                compileLiveMetricQuery({
                    explore,
                    metricQuery: query(explore.name, {
                        ...overrides,
                        filters: filters(rule(fieldId, operator, values)),
                    }),
                    timezone: 'UTC',
                    now: new Date('2026-11-27T12:00:00Z'),
                });

            expect(compileIt).toThrow(
                expect.objectContaining({
                    data: expect.objectContaining({
                        liveSourceErrorCode: 'live_source.refused.date_range',
                    }),
                }),
            );
            expect(compileIt).toThrow(/isn't a day of the calendar/);
        });
    });

    it('still reads a real date at the end of a month', () => {
        const { request } = compile(
            ERRORS,
            query('sentry_errors', {
                metrics: [error('events')],
                filters: filters(
                    rule(error('date'), FilterOperator.GREATER_THAN, [
                        '2026-10-31',
                    ]),
                ),
            }),
        );

        expect(request).toMatchObject({
            start: '2026-11-01',
            end: '2026-11-27',
        });
    });
});

describe('the shared check on Sentry explores', () => {
    const issuesOf = (explore: typeof ERRORS, metricQuery: MetricQuery) =>
        getApiSourceQueryIssues(explore.apiSource!, metricQuery).map(
            ({ code }) => code,
        );

    it('refuses a crash-free rate split by session status', () => {
        expect(
            issuesOf(
                SESSIONS,
                query('sentry_sessions', {
                    dimensions: [session('session_status')],
                    metrics: [session('crash_free_sessions')],
                }),
            ),
        ).toEqual(['live_source.refused.field_combination']);
        expect(
            issuesOf(
                SESSIONS,
                query('sentry_sessions', {
                    dimensions: [session('session_status')],
                    metrics: [session('sessions')],
                }),
            ),
        ).toEqual([]);
    });

    it('refuses Session status with another grouping, in plain words', () => {
        const message = getApiSourceQueryIssues(
            SESSIONS.apiSource!,
            query('sentry_sessions', {
                dimensions: [session('release'), session('session_status')],
                metrics: [session('sessions')],
            }),
            { itemsMap: getItemMap(SESSIONS) },
        ).map((problem) => `${problem.code}: ${problem.message}`);

        expect(message).toEqual([
            "live_source.refused.field_combination: Session status can't be combined with Release: Sentry does not say when it cuts short a list of sessions by status and by another field, so the result could be incomplete. Filter Release, Project or Environment instead.",
        ]);
        // Alone, or by day, the statuses are one short list
        expect(
            issuesOf(
                SESSIONS,
                query('sentry_sessions', {
                    dimensions: [session('date'), session('session_status')],
                    metrics: [session('sessions')],
                }),
            ),
        ).toEqual([]);
    });

    it('offers no Culprit field', () => {
        expect(Object.keys(ISSUES.apiSource!.fields)).not.toContain(
            issue('culprit'),
        );
    });

    it('refuses to leave a project out, which a parameter cannot do', () => {
        expect(
            issuesOf(
                ERRORS,
                query('sentry_errors', {
                    metrics: [error('events')],
                    filters: filters(
                        rule(error('project'), FilterOperator.NOT_EQUALS, [
                            'mobile-ios',
                        ]),
                    ),
                }),
            ),
        ).toEqual(['live_source.refused.filter_operator']);
    });

    it('offers no field that holds a user identifier', () => {
        const names = [ERRORS, ISSUES, SESSIONS].flatMap((explore) =>
            Object.values(explore.apiSource!.fields).map(
                ({ apiName }) => apiName,
            ),
        );

        expect(
            names.filter((name) => /user|email|ip|assign|owner/.test(name)),
        ).toEqual(['users_affected', 'users', 'users', 'crash_free_users']);
    });
});
