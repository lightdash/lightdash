import {
    ApiConnectorType,
    ParameterError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
    type SentryApiSource,
} from '@lightdash/common';
import { sentryIntegration } from '.';
import { connectLiveSource } from '../../liveSource.mock';
import { type LiveHttpRequest, type LiveHttpResponse } from '../../sdk';
import { toSentryError } from './api';
import { SENTRY_EXPLORES } from './model';
import { getNextCursor, SENTRY_MAX_QUERY_ROWS } from './run';

const response = (
    body: unknown,
    status = 200,
    headers: Record<string, string> = {},
): LiveHttpResponse => ({ status, headers, body });

const link = (cursor: string, hasResults: boolean) => ({
    link: `<https://sentry.io/api/0/organizations/acme/events/?cursor=0:0:1>; rel="previous"; results="false"; cursor="0:0:1", <https://sentry.io/api/0/organizations/acme/events/?cursor=${cursor}>; rel="next"; results="${hasResults}"; cursor="${cursor}"`,
});

const connectTo = (
    projectSlugs: string[],
    ...responses: LiveHttpResponse[]
) => {
    const send =
        vi.fn<(request: LiveHttpRequest) => Promise<LiveHttpResponse>>();
    responses.forEach((item) => send.mockResolvedValueOnce(item));
    return {
        send,
        source: connectLiveSource(
            sentryIntegration,
            {
                connector: ApiConnectorType.SENTRY,
                organizationSlug: 'acme',
                projectSlugs,
            },
            send,
        ),
    };
};

const connect = (...responses: LiveHttpResponse[]) =>
    connectTo(['mobile-ios', 'mobile-android'], ...responses);

const run = (
    source: ReturnType<typeof connect>['source'],
    request: Record<string, unknown>,
    limit = 10,
) => source.run({ query: JSON.stringify(request), limit });

/** The path and the decoded query parameters of one call. */
const sent = (send: ReturnType<typeof connect>['send'], call = 0) => {
    const [{ method, path, rawQuery, body }] = send.mock.calls[call];
    const params = new URLSearchParams(rawQuery);
    return {
        method,
        path,
        body,
        params,
        get: (key: string) => params.getAll(key),
    };
};

const RANGE = { start: '2026-11-01', end: '2026-11-07' };

describe('sentryIntegration errors', () => {
    it('asks Sentry to group, filter and sort, and reads its rows', async () => {
        const { source, send } = connect(
            response({
                data: [
                    {
                        'timestamp.to_day': '2026-11-07T00:00:00+00:00',
                        release: '1.0.7',
                        'error.type': ['App Hang Fully Blocked', 'NSError'],
                        'error.unhandled': 1,
                        'os.name': '',
                        'count()': 12,
                        'count_unique(issue)': 3,
                        'count_unique(user)': 9,
                    },
                ],
            }),
        );

        const result = await run(source, {
            kind: 'errors',
            columns: [
                'date',
                'release',
                'error_type',
                'unhandled',
                'os_name',
                'events',
                'issues',
                'users_affected',
            ],
            ...RANGE,
            filters: [
                { field: 'project', operator: 'is', values: ['mobile-ios'] },
                {
                    field: 'environment',
                    operator: 'is',
                    values: ['production'],
                },
                {
                    field: 'level',
                    operator: 'is_not',
                    values: ['info', 'debug'],
                },
                {
                    field: 'title',
                    operator: 'contains',
                    values: ['App "Hang"*'],
                },
                { field: 'unhandled', operator: 'is', values: ['true'] },
            ],
            sort: { column: 'issues', descending: true },
        });

        expect(send).toHaveBeenCalledTimes(1);
        const call = sent(send);
        expect(call.method).toBe('GET');
        expect(call.path).toBe('/api/0/organizations/acme/events/');
        expect(call.body).toBeUndefined();
        expect(call.get('dataset')).toEqual(['errors']);
        expect(call.get('field')).toEqual([
            'timestamp.to_day',
            'release',
            'error.type',
            'error.unhandled',
            'os.name',
            'count()',
            'count_unique(issue)',
            'count_unique(user)',
        ]);
        // Sentry leaves the end of a range out
        expect(call.get('start')).toEqual(['2026-11-01T00:00:00']);
        expect(call.get('end')).toEqual(['2026-11-08T00:00:00']);
        // Only the project the request filters by
        expect(call.get('project')).toEqual(['mobile-ios']);
        expect(call.get('environment')).toEqual(['production']);
        expect(call.get('query')).toEqual([
            '!level:["info","debug"] title:"*App \\"Hang\\"\\**" error.unhandled:true',
        ]);
        // The other dimensions break ties, so pages can't repeat a row
        expect(call.get('sort')).toEqual([
            '-count_unique(issue)',
            'timestamp.to_day',
            'release',
            'error.type',
            'error.unhandled',
            'os.name',
        ]);
        expect(call.get('per_page')).toEqual(['11']);

        expect(result.rows).toEqual([
            {
                date: '2026-11-07',
                release: '1.0.7',
                error_type: 'App Hang Fully Blocked, NSError',
                unhandled: true,
                os_name: null,
                events: 12,
                issues: 3,
                users_affected: 9,
            },
        ]);
        expect(result.hasMoreRows).toBe(false);
    });

    it('counts events to make Sentry group when no metric is selected', async () => {
        const { source, send } = connect(
            response({ data: [{ release: '1.0.7', 'count()': 4 }] }),
        );

        const result = await run(source, {
            kind: 'errors',
            columns: ['release'],
            ...RANGE,
        });

        expect(sent(send).get('field')).toEqual(['release', 'count()']);
        expect(sent(send).get('sort')).toEqual(['release']);
        expect(result.rows).toEqual([{ release: '1.0.7' }]);
    });

    it('orders by the numeric ID of an issue, which Sentry can order by', async () => {
        const { source, send } = connect(
            response({
                data: [
                    {
                        issue: 'MOBILE-IOS-1A',
                        'issue.id': 42,
                        level: 'error',
                        'count()': 3,
                    },
                ],
            }),
        );

        const result = await run(source, {
            kind: 'errors',
            columns: ['issue', 'level', 'events'],
            ...RANGE,
            sort: { column: 'events', descending: true },
        });

        const call = sent(send);
        expect(call.get('field')).toEqual([
            'issue',
            'level',
            'count()',
            'issue.id',
        ]);
        expect(call.get('sort')).toEqual(['-count()', 'issue.id', 'level']);
        expect(result.rows).toEqual([
            { issue: 'MOBILE-IOS-1A', level: 'error', events: 3 },
        ]);
    });

    it('counts one issue a row when grouped by issue, and does not ask Sentry to', async () => {
        const { source, send } = connect(
            response({
                data: [
                    {
                        release: '1.0.7',
                        issue: 'MOBILE-IOS-1A',
                        'issue.id': 42,
                        'count()': 3,
                        'count_unique(user)': 2,
                    },
                ],
            }),
        );

        const result = await run(source, {
            kind: 'errors',
            columns: ['release', 'issue', 'issues', 'events', 'users_affected'],
            ...RANGE,
            // The same on every row, so it is not sent either
            sort: { column: 'issues', descending: true },
        });

        const call = sent(send);
        // Sentry refuses a field both grouped by and counted
        expect(call.get('field')).toEqual([
            'release',
            'issue',
            'count()',
            'count_unique(user)',
            'issue.id',
        ]);
        expect(call.get('sort')).toEqual(['release', 'issue.id']);
        expect(result.rows).toEqual([
            {
                release: '1.0.7',
                issue: 'MOBILE-IOS-1A',
                issues: 1,
                events: 3,
                users_affected: 2,
            },
        ]);
    });

    it('still makes Sentry group when Issues by issue is the only metric', async () => {
        const { source, send } = connect(
            response({
                data: [
                    { issue: 'MOBILE-IOS-1A', 'issue.id': 42, 'count()': 3 },
                ],
            }),
        );

        const result = await run(source, {
            kind: 'errors',
            columns: ['issue', 'issues'],
            ...RANGE,
        });

        expect(sent(send).get('field')).toEqual([
            'issue',
            'count()',
            'issue.id',
        ]);
        expect(result.rows).toEqual([{ issue: 'MOBILE-IOS-1A', issues: 1 }]);
    });

    it('asks Sentry to count issues by any other dimension, each field once', async () => {
        const { source, send } = connect(
            response({
                data: [{ title: 'App Hang', 'count_unique(issue)': 4 }],
            }),
        );

        const result = await run(source, {
            kind: 'errors',
            columns: ['title', 'issues'],
            ...RANGE,
            sort: { column: 'issues', descending: true },
        });

        const fields = sent(send).get('field');
        expect(fields).toEqual(['title', 'count_unique(issue)']);
        expect(new Set(fields).size).toBe(fields.length);
        expect(sent(send).get('sort')).toEqual([
            '-count_unique(issue)',
            'title',
        ]);
        expect(result.rows).toEqual([{ title: 'App Hang', issues: 4 }]);
    });

    it("names the source's projects on every call, so Sentry reads no other", async () => {
        const { source, send } = connect(
            response({ data: [] }),
            response([]),
            response({ groups: [] }),
        );

        await run(source, { kind: 'errors', columns: ['events'], ...RANGE });
        await run(source, { kind: 'issues', columns: ['short_id'] });
        await run(source, {
            kind: 'sessions',
            columns: ['release', 'sessions'],
            ...RANGE,
        });

        [0, 1, 2].forEach((call) =>
            expect(sent(send, call).get('project')).toEqual([
                'mobile-ios',
                'mobile-android',
            ]),
        );
    });

    it('names a project one time when the source names it two times', async () => {
        const { source, send } = connectTo(
            ['mobile', 'mobile'],
            response({ data: [{ 'count()': 7 }] }),
        );

        await run(source, { kind: 'errors', columns: ['events'], ...RANGE });

        expect(sent(send).get('project')).toEqual(['mobile']);
    });

    it('refuses a project the source does not name, before calling', async () => {
        const { source, send } = connect();
        const filterBy = (...filters: string[][]) =>
            run(source, {
                kind: 'errors',
                columns: ['events'],
                ...RANGE,
                filters: filters.map((values) => ({
                    field: 'project',
                    operator: 'is',
                    values,
                })),
            });

        await expect(filterBy(['mobile-ios', 'backend'])).rejects.toThrow(
            "This Sentry source reads only these projects: mobile-ios, mobile-android. It can't read backend.",
        );
        // Two filters that share no project would name none, and Sentry
        // would then read every project
        await expect(
            filterBy(['mobile-ios'], ['mobile-android']),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(send).not.toHaveBeenCalled();
    });

    it('reads the next page while the Link header says it has results', async () => {
        const page = (from: number, count: number) =>
            Array.from({ length: count }, (_, index) => ({
                release: `1.0.${from + index}`,
                'count()': 1,
            }));
        const { source, send } = connect(
            response({ data: page(0, 100) }, 200, link('0:100:0', true)),
            response({ data: page(100, 20) }, 200, link('0:200:0', false)),
        );

        const result = await run(
            source,
            { kind: 'errors', columns: ['release', 'events'], ...RANGE },
            150,
        );

        expect(send).toHaveBeenCalledTimes(2);
        expect(sent(send, 0).get('cursor')).toEqual([]);
        expect(sent(send, 1).get('cursor')).toEqual(['0:100:0']);
        expect(result.rows).toHaveLength(120);
        expect(result.hasMoreRows).toBe(false);
    });

    it('refuses a column, filter or field that is not on its list, before calling', async () => {
        const { source, send } = connect();

        await expect(
            run(source, {
                kind: 'errors',
                columns: ['release', 'user.email'],
                ...RANGE,
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        await expect(
            run(source, {
                kind: 'errors',
                columns: ['events'],
                ...RANGE,
                filters: [
                    { field: 'user.email', operator: 'is', values: ['a@b.c'] },
                ],
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        await expect(
            run(source, {
                kind: 'errors',
                columns: ['events'],
                ...RANGE,
                query: 'user.email:a@b.c',
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(send).not.toHaveBeenCalled();
    });

    it('refuses a limit past what one query can read, before calling', async () => {
        const { source, send } = connect();

        await expect(
            run(
                source,
                { kind: 'errors', columns: ['events'], ...RANGE },
                SENTRY_MAX_QUERY_ROWS + 1,
            ),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(send).not.toHaveBeenCalled();
    });
});

describe('sentryIntegration issues', () => {
    const sentryIssue = (overrides: Record<string, unknown> = {}) => ({
        id: '1',
        shortId: 'MOBILE-IOS-1A',
        title: 'App Hang Fully Blocked',
        culprit: 'DashboardView.body',
        level: 'error',
        status: 'unresolved',
        substatus: 'ongoing',
        priority: 'high',
        project: { id: '2', slug: 'mobile-ios', name: 'Mobile iOS' },
        platform: 'cocoa',
        issueCategory: 'error',
        isUnhandled: false,
        firstSeen: '2026-11-12T08:15:00Z',
        lastSeen: '2026-11-27T10:00:00Z',
        count: '150',
        userCount: 42,
        permalink: 'https://acme.sentry.io/issues/1/',
        assignedTo: { type: 'user', name: 'Jane', email: 'jane@example.com' },
        ...overrides,
    });

    it('lists issues with a search, and reads only its columns', async () => {
        const { source, send } = connect(response([sentryIssue()]));

        const result = await run(source, {
            kind: 'issues',
            columns: [
                'short_id',
                'title',
                'status',
                'project',
                'unhandled',
                'first_seen',
                'events',
                'users',
                'url',
                'release',
            ],
            filters: [
                { field: 'status', operator: 'is', values: ['unresolved'] },
                { field: 'release', operator: 'is', values: ['1.0.7'] },
                {
                    field: 'priority',
                    operator: 'is',
                    values: ['high', 'medium'],
                },
            ],
            firstSeen: { start: '2026-11-12', end: '2026-11-20' },
            sort: 'user',
        });

        const call = sent(send);
        expect(call.path).toBe('/api/0/organizations/acme/issues/');
        expect(call.get('query')).toEqual([
            'is:unresolved release:"1.0.7" issue.priority:["high","medium"] firstSeen:>=2026-11-12T00:00:00Z firstSeen:<2026-11-21T00:00:00Z',
        ]);
        expect(call.get('statsPeriod')).toEqual(['90d']);
        expect(call.get('sort')).toEqual(['user']);
        // Not "stats": that drops the counts and dates of each issue
        expect(call.get('collapse')).toEqual(['lifetime']);
        expect(call.get('limit')).toEqual(['11']);
        expect(result.rows).toEqual([
            {
                short_id: 'MOBILE-IOS-1A',
                title: 'App Hang Fully Blocked',
                status: 'unresolved',
                project: 'mobile-ios',
                unhandled: false,
                first_seen: '2026-11-12',
                events: 150,
                users: 42,
                url: 'https://acme.sentry.io/issues/1/',
                release: null,
            },
        ]);
        expect(JSON.stringify(result.rows)).not.toContain('jane');
    });

    it('has no Culprit column: an app can put any text in it', async () => {
        const { source, send } = connect(response([sentryIssue()]));

        await expect(
            run(source, { kind: 'issues', columns: ['short_id', 'culprit'] }),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(send).not.toHaveBeenCalled();

        const result = await run(source, {
            kind: 'issues',
            columns: ['short_id', 'title'],
        });
        expect(JSON.stringify(result.rows)).not.toContain('DashboardView');
    });

    it('sends an empty search, so resolved issues are listed too', async () => {
        const { source, send } = connect(response([]));

        await run(source, { kind: 'issues', columns: ['short_id'] });

        const call = sent(send);
        expect(call.params.has('query')).toBe(true);
        expect(call.get('query')).toEqual(['']);
        expect(call.get('sort')).toEqual(['date']);
    });

    it('refuses a status Sentry does not have', async () => {
        const { source } = connect();

        await expect(
            run(source, {
                kind: 'issues',
                columns: ['short_id'],
                filters: [
                    { field: 'status', operator: 'is', values: ['open'] },
                ],
            }),
        ).rejects.toBeInstanceOf(ParameterError);
    });
});

describe('sentryIntegration sessions', () => {
    it('reads each project of the source apart when Project is selected, by its slug', async () => {
        const totals = (sessions: number) => ({
            groups: [
                {
                    by: { release: '1.0.7' },
                    totals: {
                        'sum(session)': sessions,
                        'crash_free_rate(session)': sessions ? 0.9975 : null,
                        'crash_free_rate(user)': sessions ? 0.99 : null,
                    },
                },
            ],
        });
        const { source, send } = connect(
            response(totals(2000)),
            response(totals(0)),
        );

        const result = await run(source, {
            kind: 'sessions',
            columns: [
                'project',
                'release',
                'crash_free_sessions',
                'crash_free_users',
            ],
            ...RANGE,
            filters: [
                {
                    field: 'release',
                    operator: 'is',
                    values: ['1.0.7', '1.0.8'],
                },
            ],
        });

        // Sentry names a project by a number when it groups by project, so
        // the source reads one named project a call and never lists projects
        expect(send).toHaveBeenCalledTimes(2);
        [0, 1].forEach((index) =>
            expect(sent(send, index).path).toBe(
                '/api/0/organizations/acme/sessions/',
            ),
        );
        expect(sent(send, 0).get('project')).toEqual(['mobile-ios']);
        expect(sent(send, 1).get('project')).toEqual(['mobile-android']);
        const call = sent(send, 0);
        // Sessions are read too, to leave out groups that have none
        expect(call.get('field')).toEqual([
            'crash_free_rate(session)',
            'crash_free_rate(user)',
            'sum(session)',
        ]);
        expect(call.get('groupBy')).toEqual(['release']);
        expect(call.get('interval')).toEqual(['1d']);
        expect(call.get('includeSeries')).toEqual(['0']);
        expect(call.get('includeTotals')).toEqual(['1']);
        expect(call.get('query')).toEqual(['release:["1.0.7","1.0.8"]']);
        expect(result.rows).toEqual([
            {
                project: 'mobile-ios',
                release: '1.0.7',
                crash_free_sessions: 0.9975,
                crash_free_users: 0.99,
            },
        ]);
    });

    it('reads a project one time when the source names it two times', async () => {
        const { source, send } = connectTo(
            ['mobile', 'mobile'],
            response({ groups: [{ by: {}, totals: { 'sum(session)': 7 } }] }),
        );

        const result = await run(source, {
            kind: 'sessions',
            columns: ['project', 'sessions'],
            ...RANGE,
        });

        expect(send).toHaveBeenCalledTimes(1);
        expect(sent(send).get('project')).toEqual(['mobile']);
        expect(result.rows).toEqual([{ project: 'mobile', sessions: 7 }]);
    });

    it('refuses Session status with another grouping, where Sentry can cut the list short unseen', async () => {
        const { source, send } = connect();

        for (const column of ['release', 'project', 'environment']) {
            // eslint-disable-next-line no-await-in-loop
            await expect(
                run(source, {
                    kind: 'sessions',
                    columns: [column, 'session_status', 'sessions'],
                    ...RANGE,
                }),
            ).rejects.toBeInstanceOf(ParameterError);
        }
        expect(send).not.toHaveBeenCalled();
    });

    it('reads sessions by status in one call, and refuses a list Sentry says it cut', async () => {
        const byStatus = {
            groups: ['healthy', 'errored', 'crashed', 'abnormal'].map(
                (status, index) => ({
                    by: { 'session.status': status },
                    totals: {
                        'sum(session)': index === 3 ? 0 : 10 * (index + 1),
                    },
                }),
            ),
        };
        const { source, send } = connect(
            response(byStatus),
            response(byStatus, 200, link('0:10:0', true)),
        );
        const request = {
            kind: 'sessions',
            columns: ['session_status', 'sessions'],
            ...RANGE,
        };

        const result = await run(source, request);

        // Far from the count of statuses, so Sentry drops none as a "next page"
        expect(sent(send).get('per_page')).toEqual(['10']);
        expect(result.rows).toEqual([
            { session_status: 'healthy', sessions: 10 },
            { session_status: 'errored', sessions: 20 },
            { session_status: 'crashed', sessions: 30 },
        ]);
        await expect(run(source, request)).rejects.toMatchObject({
            data: { liveSourceErrorCode: 'live_source.refused.row_limit' },
        });
        expect(send).toHaveBeenCalledTimes(2);
    });

    it('reads one row per group and day, skipping days with no sessions', async () => {
        const { source, send } = connect(
            response({
                intervals: [
                    '2026-11-01T00:00:00Z',
                    '2026-11-02T00:00:00Z',
                    '2026-11-03T00:00:00Z',
                ],
                groups: [
                    {
                        by: { release: '1.0.7' },
                        series: {
                            'sum(session)': [10, 0, 30],
                            'count_unique(user)': [4, 0, 9],
                        },
                    },
                ],
            }),
        );

        const result = await run(source, {
            kind: 'sessions',
            columns: ['date', 'release', 'sessions', 'users'],
            start: '2026-11-01',
            end: '2026-11-03',
        });

        const call = sent(send);
        expect(call.get('includeSeries')).toEqual(['1']);
        expect(call.get('includeTotals')).toEqual(['0']);
        expect(call.get('per_page')).toEqual(['100']);
        expect(result.rows).toEqual([
            { date: '2026-11-01', release: '1.0.7', sessions: 10, users: 4 },
            { date: '2026-11-03', release: '1.0.7', sessions: 30, users: 9 },
        ]);
    });

    it('asks for fewer groups over a long range, to stay under the point cap', async () => {
        const { source, send } = connect(response({ groups: [] }));

        await run(source, {
            kind: 'sessions',
            columns: ['date', 'release', 'sessions'],
            start: '2026-06-01',
            end: '2026-11-27',
        });

        // 180 days: Sentry reads one group more than asked, to find the next
        // page, and 55 x 181 points is the most under its 10,000
        expect(sent(send).get('per_page')).toEqual(['54']);
    });

    it('keeps totals under the point cap too', async () => {
        const { source, send } = connect(response({ groups: [] }));

        await run(
            source,
            {
                kind: 'sessions',
                columns: ['release', 'sessions'],
                start: '2026-06-01',
                end: '2026-11-27',
            },
            500,
        );

        expect(sent(send).get('per_page')).toEqual(['54']);
    });

    it('refuses a crash-free rate for one session status, before calling', async () => {
        const { source, send } = connect();

        await expect(
            run(source, {
                kind: 'sessions',
                columns: ['session_status', 'crash_free_sessions'],
                ...RANGE,
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(send).not.toHaveBeenCalled();
    });
});

describe('sentryIntegration errors from Sentry', () => {
    const request = { kind: 'errors', columns: ['events'], ...RANGE };

    // Sentry's own text names its fields and functions, never the explore's
    const SENTRY_TEXT =
        'To use issue.id you must first remove the function(s): count_unique(issue)';

    it.each([
        [401, WarehouseConnectionError, /rejected the auth token\. Create/],
        [403, WarehouseConnectionError, /read access to Organization/],
        [404, WarehouseConnectionError, /organization "acme"/],
        [400, WarehouseQueryError, /couldn't run this query\. Check/],
        [503, UnexpectedServerError, /returned the status 503\.$/],
    ])('explains a %i in its own words', async (status, type, message) => {
        const { source } = connect(response({ detail: SENTRY_TEXT }, status));

        const failed = run(source, request);

        await expect(failed).rejects.toBeInstanceOf(type);
        await expect(failed).rejects.toThrow(message);
        await expect(failed).rejects.not.toThrow(/issue\.id|count_unique/);
    });

    it('reads when to retry from the rate limit headers', async () => {
        const { source } = connect(
            response({ detail: 'Rate limit exceeded' }, 429, {
                'retry-after': '7',
            }),
        );

        const failed = run(source, request);

        await expect(failed).rejects.toBeInstanceOf(TooManyRequestsError);
        await expect(failed).rejects.toMatchObject({
            data: { retryAfterSeconds: 7 },
        });
    });

    it('reads when to retry from the reset time of Sentry, when it is all Sentry sends', () => {
        const error = toSentryError(
            {
                status: 429,
                headers: { 'x-sentry-rate-limit-reset': '1795800060' },
                body: {},
            },
            { organizationSlug: 'acme' },
            new Date(1_795_800_000_000),
        );

        expect(error).toBeInstanceOf(TooManyRequestsError);
        expect(error).toMatchObject({ data: { retryAfterSeconds: 60 } });
    });

    it('refuses a response in another shape', async () => {
        const { source } = connect(response({ rows: [] }));

        await expect(run(source, request)).rejects.toBeInstanceOf(
            UnexpectedServerError,
        );
    });
});

describe('sentryIntegration setup test', () => {
    const settings: SentryApiSource = {
        connector: ApiConnectorType.SENTRY,
        organizationSlug: 'acme',
        projectSlugs: ['mobile-ios', 'mobile-android'],
    };

    it('sends one request that names only the projects of the source', () => {
        const request = sentryIntegration.connection.testRequest?.(settings);

        expect(request).toMatchObject({
            method: 'GET',
            path: '/api/0/organizations/acme/events/',
        });
        const params = new URLSearchParams(request?.rawQuery);
        expect(params.getAll('project')).toEqual([
            'mobile-ios',
            'mobile-android',
        ]);
        expect(params.getAll('field')).toEqual(['count()']);
        expect(params.get('dataset')).toBe('errors');
    });

    it('can call no path that lists the projects of the organization', () => {
        expect(
            sentryIntegration.connection
                .access(settings, SENTRY_EXPLORES)
                .rules.map(({ path }) => path),
        ).toEqual([
            '/api/0/organizations/acme/events/',
            '/api/0/organizations/acme/issues/',
            '/api/0/organizations/acme/sessions/',
        ]);
    });

    it('says what it reached: the projects it names, and a count', () => {
        expect(
            sentryIntegration.connection.summarizeTest?.(
                { data: [{ 'count()': 1204 }] },
                settings,
            ),
        ).toEqual({
            summary: 'The token reaches the Sentry organization acme.',
            facts: [
                { label: 'Projects', value: 'mobile-ios, mobile-android' },
                { label: 'Error events in the last 24 hours', value: '1,204' },
            ],
        });
    });

    it('names a project one time when the source names it two times', () => {
        const twice = { ...settings, projectSlugs: ['mobile', 'mobile'] };

        expect(
            new URLSearchParams(
                sentryIntegration.connection.testRequest?.(twice).rawQuery,
            ).getAll('project'),
        ).toEqual(['mobile']);
        expect(
            sentryIntegration.connection.summarizeTest?.({ data: [] }, twice)
                ?.facts[0],
        ).toEqual({ label: 'Projects', value: 'mobile' });
        // A saved source keeps each project one time
        expect(
            sentryIntegration.connection.settings.parse(twice).projectSlugs,
        ).toEqual(['mobile']);
    });

    it('refuses a slug of digits only, which Sentry reads as an ID', () => {
        const parse = (overrides: Record<string, unknown>) =>
            sentryIntegration.connection.settings.safeParse({
                ...settings,
                ...overrides,
            }).success;

        expect(parse({})).toBe(true);
        expect(parse({ projectSlugs: ['12345'] })).toBe(false);
        expect(parse({ organizationSlug: '42' })).toBe(false);
        expect(parse({ projectSlugs: ['ios-17'] })).toBe(true);
    });
});

describe('sentryIntegration filters keep their meaning', () => {
    const errors = (filters: unknown[]) => ({
        kind: 'errors',
        columns: ['events'],
        ...RANGE,
        filters,
    });
    const issues = (filters: unknown[]) => ({
        kind: 'issues',
        columns: ['short_id'],
        filters,
    });
    const is = (field: string, ...values: string[]) => ({
        field,
        operator: 'is',
        values,
    });
    const queryOf = async (request: Record<string, unknown>) => {
        const { source, send } = connect(
            response(request.kind === 'issues' ? [] : { data: [] }),
        );
        await run(source, request);
        return sent(send);
    };

    it('reads only the environments every Environment filter keeps', async () => {
        const call = await queryOf(
            errors([
                is('environment', 'production', 'staging'),
                is('environment', 'production'),
            ]),
        );
        expect(call.get('environment')).toEqual(['production']);

        const { source, send } = connect();
        await expect(
            run(
                source,
                errors([
                    is('environment', 'production'),
                    is('environment', 'staging'),
                ]),
            ),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(send).not.toHaveBeenCalled();
    });

    it('keeps handled and unhandled errors when Unhandled is either', async () => {
        const both = await queryOf(errors([is('unhandled', 'true', 'false')]));
        expect(both.get('query')).toEqual(['']);

        const one = await queryOf(errors([is('unhandled', 'false')]));
        expect(one.get('query')).toEqual(['error.unhandled:false']);
    });

    it('filters issues by several statuses', async () => {
        const send = async (operator: string, ...values: string[]) =>
            (
                await queryOf({
                    kind: 'issues',
                    columns: ['short_id'],
                    filters: [{ field: 'status', operator, values }],
                })
            ).get('query');

        expect(await send('is', 'unresolved')).toEqual(['is:unresolved']);
        // Sentry has no "or" for a status, so two of three is "not the third"
        expect(await send('is', 'unresolved', 'resolved')).toEqual([
            '!is:archived',
        ]);
        expect(await send('is', 'unresolved', 'resolved', 'ignored')).toEqual([
            '',
        ]);
        // Which leaves one status, so it is asked for by its name
        expect(await send('is_not', 'unresolved', 'resolved')).toEqual([
            'is:archived',
        ]);
        expect(await send('is_not', 'unresolved')).toEqual(['!is:unresolved']);

        const { source, send: transport } = connect();
        await expect(
            run(
                source,
                issues([
                    {
                        field: 'status',
                        operator: 'is_not',
                        values: ['unresolved', 'resolved', 'ignored'],
                    },
                ]),
            ),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(transport).not.toHaveBeenCalled();
    });

    it('matches any of several title parts on errors, and refuses that on issues', async () => {
        const contains = {
            field: 'title',
            operator: 'contains',
            values: ['Hang', 'Watchdog'],
        };
        const call = await queryOf(errors([contains]));
        expect(call.get('query')).toEqual([
            '(title:"*Hang*" OR title:"*Watchdog*")',
        ]);

        // Sentry issue search has no "or"
        const { source, send } = connect();
        await expect(run(source, issues([contains]))).rejects.toBeInstanceOf(
            ParameterError,
        );
        expect(send).not.toHaveBeenCalled();
    });
});

describe('sentryIntegration row cap', () => {
    const request = {
        kind: 'errors',
        columns: ['release', 'events'],
        ...RANGE,
    };
    const pages = (total: number) =>
        Array.from({ length: Math.ceil(total / 100) }, (_, page) => {
            const count = Math.min(100, total - page * 100);
            const isLast = (page + 1) * 100 >= total;
            return response(
                {
                    data: Array.from({ length: count }, (__, index) => ({
                        release: `1.0.${page * 100 + index}`,
                        'count()': 1,
                    })),
                },
                200,
                link(`0:${(page + 1) * 100}:0`, !isLast),
            );
        });

    it('returns 999 rows when Sentry has 999', async () => {
        const { source } = connect(...pages(SENTRY_MAX_QUERY_ROWS));

        const result = await run(source, request, SENTRY_MAX_QUERY_ROWS);

        expect(result.rows).toHaveLength(999);
        expect(result.hasMoreRows).toBe(false);
    });

    it('refuses when Sentry has 1,000 rows, and does not return 999 of them', async () => {
        const { source } = connect(...pages(1_000));

        await expect(
            run(source, request, SENTRY_MAX_QUERY_ROWS),
        ).rejects.toMatchObject({
            data: { liveSourceErrorCode: 'live_source.refused.row_limit' },
        });
    });

    it('still returns the top rows of a smaller limit, and says more exist', async () => {
        const { source } = connect(...pages(1_000));

        const result = await run(source, request, 10);

        expect(result.rows).toHaveLength(10);
        expect(result.hasMoreRows).toBe(true);
    });
});

describe('sentryIntegration row cap across projects', () => {
    const request = {
        kind: 'sessions',
        columns: ['project', 'release', 'sessions'],
        ...RANGE,
    };
    /** Sentry with this many releases in each project, a page at a time. */
    const connectToReleases = (releases: Record<string, number>) => {
        const { source, send } = connectTo(Object.keys(releases));
        send.mockImplementation(async ({ rawQuery }) => {
            const params = new URLSearchParams(rawQuery);
            const total = releases[params.get('project') ?? ''];
            const offset = Number(params.get('cursor')?.split(':')[1] ?? 0);
            const end = Math.min(
                total,
                offset + Number(params.get('per_page')),
            );
            return response(
                {
                    groups: Array.from(
                        { length: end - offset },
                        (_, index) => ({
                            by: { release: `1.0.${offset + index}` },
                            totals: { 'sum(session)': 1 },
                        }),
                    ),
                },
                200,
                link(`0:${end}:0`, end < total),
            );
        });
        return source;
    };

    it('returns 999 rows of two projects when Sentry has 999', async () => {
        const source = connectToReleases({ ios: 500, android: 499 });

        const result = await run(source, request, SENTRY_MAX_QUERY_ROWS);

        expect(result.rows).toHaveLength(999);
        expect(result.hasMoreRows).toBe(false);
    });

    it.each([
        // Neither project has 999 rows of its own
        [{ ios: 500, android: 500 }],
        [{ ios: 999, android: 1 }],
    ])('refuses 1,000 rows of two projects: %o', async (releases) => {
        const source = connectToReleases(releases);

        await expect(
            run(source, request, SENTRY_MAX_QUERY_ROWS),
        ).rejects.toMatchObject({
            data: { liveSourceErrorCode: 'live_source.refused.row_limit' },
        });
    });

    it('still returns the top rows of a smaller limit, and says more exist', async () => {
        const source = connectToReleases({ ios: 6, android: 6 });

        const result = await run(source, request, 10);

        expect(result.rows).toHaveLength(10);
        expect(result.hasMoreRows).toBe(true);
    });
});

describe('sentryIntegration dates', () => {
    it.each(['2026-11-99', '2026-02-30'])(
        'refuses %s, a day that does not exist, before calling',
        async (day) => {
            const { source, send } = connect();

            await expect(
                run(source, {
                    kind: 'errors',
                    columns: ['events'],
                    start: '2026-01-01',
                    end: day,
                }),
            ).rejects.toMatchObject({
                data: { liveSourceErrorCode: 'live_source.refused.date_range' },
            });
            await expect(
                run(source, {
                    kind: 'issues',
                    columns: ['short_id'],
                    firstSeen: { start: '2026-01-01', end: day },
                }),
            ).rejects.toMatchObject({
                data: { liveSourceErrorCode: 'live_source.refused.date_range' },
            });
            expect(send).not.toHaveBeenCalled();
        },
    );
});

describe('getNextCursor', () => {
    it('reads the next cursor only when it has results', () => {
        expect(getNextCursor(link('0:100:0', true).link)).toBe('0:100:0');
        expect(getNextCursor(link('0:100:0', false).link)).toBeUndefined();
        expect(getNextCursor(undefined)).toBeUndefined();
    });

    it('reads the cursor from the link target when no attribute repeats it', () => {
        // As Sentry's pagination reference writes it, and after the proxy
        // makes the target a path
        expect(
            getNextCursor(
                '<https://sentry.io/api/0/organizations/acme/events/?&cursor=0:0:1>; rel="previous"; results="false", <https://sentry.io/api/0/organizations/acme/events/?field=count()&query=a,b&cursor=0:100:0>; rel="next"; results="true"',
            ),
        ).toBe('0:100:0');
        expect(
            getNextCursor(
                '</api/0/organizations/acme/events/?cursor=0%3A200%3A0>; rel="next"; results="true"',
            ),
        ).toBe('0:200:0');
        expect(
            getNextCursor(
                '</api/0/organizations/acme/events/?cursor=0:200:0>; rel="next"; results="false"',
            ),
        ).toBeUndefined();
    });
});
