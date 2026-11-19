import {
    ApiConnectorType,
    ParameterError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { githubIntegration } from '.';
import { connectLiveSource } from '../../liveSource.mock';
import { type LiveHttpResponse } from '../../types';
import {
    GITHUB_LIST_MAX_PAGES,
    GITHUB_MAX_QUERY_ROWS,
    GITHUB_STATS_RETRY_DELAYS_MS,
} from './run';

const response = (
    body: unknown,
    status = 200,
    headers: Record<string, string> = {},
): LiveHttpResponse => ({ status, headers, body });

const connect = (...responses: LiveHttpResponse[]) => {
    const send = vi.fn();
    responses.forEach((item) => send.mockResolvedValueOnce(item));
    return {
        send,
        source: connectLiveSource(
            githubIntegration,
            {
                connector: ApiConnectorType.GITHUB,
                owner: 'lightdash',
                repo: 'lightdash',
            },
            send,
        ),
    };
};

const item = (number: number, overrides: Record<string, unknown> = {}) => ({
    number,
    title: `PR ${number}`,
    html_url: `https://github.com/lightdash/lightdash/pull/${number}`,
    state: 'closed',
    user: { login: 'octocat' },
    assignee: null,
    labels: [{ name: 'bug' }, { name: 'ui' }],
    draft: false,
    comments: 2,
    created_at: '2026-10-01T09:00:00Z',
    updated_at: '2026-10-02T09:00:00Z',
    closed_at: '2026-10-03T09:00:00Z',
    pull_request: { merged_at: '2026-10-03T09:00:00Z' },
    ...overrides,
});

const search = (totalCount: number, items: unknown[]) =>
    response({ total_count: totalCount, incomplete_results: false, items });

const run = (
    source: ReturnType<typeof connect>['source'],
    request: Record<string, unknown>,
    limit = 10,
) => source.run({ query: JSON.stringify(request), limit });

describe('githubIntegration search', () => {
    it('counts with one call that names the repository and type', async () => {
        const { source, send } = connect(search(42, [item(1)]));

        const result = await run(source, {
            kind: 'search',
            type: 'pr',
            q: 'is:merged author:octocat',
            columns: ['total_count'],
        });

        expect(send).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenCalledWith({
            method: 'GET',
            path: '/search/issues',
            query: {
                q: 'repo:lightdash/lightdash is:pr is:merged author:octocat',
                per_page: '1',
            },
            body: undefined,
        });
        expect(result.rows).toEqual([{ total_count: 42 }]);
        expect(result.hasMoreRows).toBe(false);
    });

    it('lists rows, reading merged state, labels and days', async () => {
        const { source } = connect(
            search(1, [item(7, { draft: true, assignee: { login: 'jo' } })]),
        );

        const result = await run(source, {
            kind: 'search',
            type: 'pr',
            q: '',
            columns: [
                'number',
                'state',
                'labels',
                'assignee',
                'draft',
                'merged_at',
                'search',
            ],
        });

        expect(result.rows).toEqual([
            {
                number: 7,
                state: 'merged',
                labels: 'bug, ui',
                assignee: 'jo',
                draft: true,
                merged_at: '2026-10-03',
                search: null,
            },
        ]);
    });

    it('reads numbered pages until it has one row past the limit', async () => {
        const firstPage = Array.from({ length: 100 }, (_, i) => item(i + 1));
        const secondPage = Array.from({ length: 100 }, (_, i) => item(i + 101));
        const { source, send } = connect(
            search(500, firstPage),
            search(500, secondPage),
        );

        const result = await run(
            source,
            {
                kind: 'search',
                type: 'issue',
                q: 'is:open',
                columns: ['number'],
                sort: 'created',
                order: 'desc',
            },
            150,
        );

        expect(send).toHaveBeenCalledTimes(2);
        expect(send.mock.calls[1][0].query).toEqual({
            q: 'repo:lightdash/lightdash is:issue is:open',
            sort: 'created',
            order: 'desc',
            per_page: '100',
            page: '2',
        });
        expect(result.rows).toHaveLength(150);
        expect(result.hasMoreRows).toBe(true);
    });

    it('stops at the last page search can reach', async () => {
        const { source, send } = connect(
            search(3, [item(1), item(2), item(3)]),
        );

        const result = await run(source, {
            kind: 'search',
            type: 'pr',
            q: '',
            columns: ['number'],
        });

        expect(send).toHaveBeenCalledTimes(1);
        expect(result.rows).toHaveLength(3);
        expect(result.hasMoreRows).toBe(false);
    });

    it('refuses a search that sets its own repository or type', async () => {
        const { source, send } = connect();

        await expect(
            run(source, {
                kind: 'search',
                type: 'pr',
                q: 'repo:someone/else is:open',
                columns: ['total_count'],
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        await expect(
            run(source, {
                kind: 'search',
                type: 'pr',
                q: 'is:issue',
                columns: ['total_count'],
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(send).not.toHaveBeenCalled();
    });

    it('refuses more rows than search can return', async () => {
        const { source, send } = connect();

        await expect(
            run(
                source,
                { kind: 'search', type: 'pr', q: '', columns: ['number'] },
                GITHUB_MAX_QUERY_ROWS + 1,
            ),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(send).not.toHaveBeenCalled();
    });

    it('fails on an unexpected response shape', async () => {
        const { source } = connect(response({ items: 'nope' }));

        await expect(
            run(source, {
                kind: 'search',
                type: 'pr',
                q: '',
                columns: ['total_count'],
            }),
        ).rejects.toThrow();
    });
});

const week = (isoDate: string) =>
    new Date(`${isoDate}T00:00:00Z`).getTime() / 1000;

const STATS = [
    {
        author: { login: 'ada' },
        weeks: [
            { w: week('2026-10-04'), a: 10, d: 1, c: 3 },
            { w: week('2026-10-11'), a: 0, d: 0, c: 0 },
            { w: week('2026-10-18'), a: 5, d: 5, c: 2 },
        ],
    },
    {
        author: { login: 'grace' },
        weeks: [
            { w: week('2026-10-04'), a: 1, d: 0, c: 9 },
            { w: week('2026-09-27'), a: 1, d: 0, c: 4 },
        ],
    },
    {
        author: null,
        weeks: [{ w: week('2026-10-18'), a: 0, d: 0, c: 1 }],
    },
];

/** A pull request as the pulls list returns it: merged_at on top, no comment count. */
const pull = (number: number, createdAt: string) => {
    const {
        comments,
        pull_request: pullRequest,
        ...rest
    } = item(number, {
        created_at: `${createdAt}T09:00:00Z`,
    });
    return { ...rest, merged_at: pullRequest.merged_at };
};

const createdIn = (start: string, end: string) => ({
    column: 'created_at',
    op: 'between',
    start,
    end,
});

describe('githubIntegration list', () => {
    it('lists pull requests newest first, stopping past the Created range', async () => {
        const { source, send } = connect(
            response([
                pull(3, '2026-11-05'),
                pull(2, '2026-10-20'),
                pull(1, '2026-09-30'),
            ]),
        );

        const result = await run(source, {
            kind: 'list',
            type: 'pr',
            filters: [createdIn('2026-10-01', '2026-10-31')],
            columns: ['number', 'state', 'merged_at'],
        });

        expect(send).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenCalledWith({
            method: 'GET',
            path: '/repos/lightdash/lightdash/pulls',
            query: {
                state: 'all',
                sort: 'created',
                direction: 'desc',
                per_page: '100',
                page: '1',
            },
            body: undefined,
        });
        expect(result.rows).toEqual([
            { number: 2, state: 'merged', merged_at: '2026-10-03' },
        ]);
        expect(result.hasMoreRows).toBe(false);
    });

    it('counts every item in range, over as many pages as it takes', async () => {
        const firstPage = Array.from({ length: 100 }, (_, i) =>
            pull(300 - i, '2025-06-10'),
        );
        const { source, send } = connect(
            response(firstPage),
            response([pull(200, '2025-06-02'), pull(199, '2025-05-31')]),
        );

        const result = await run(source, {
            kind: 'list',
            type: 'pr',
            filters: [createdIn('2025-06-01', '2025-06-30')],
            columns: ['total_count'],
        });

        expect(send).toHaveBeenCalledTimes(2);
        expect(send.mock.calls[1][0].query.page).toBe('2');
        expect(result.rows).toEqual([{ total_count: 101 }]);
    });

    it('reads issues from the issue list, narrowed there and without pull requests', async () => {
        const { source, send } = connect(
            response([
                item(9, { pull_request: undefined, state_reason: 'completed' }),
                item(8),
            ]),
        );

        const result = await run(source, {
            kind: 'list',
            type: 'issue',
            filters: [
                { column: 'author', op: 'eq', value: 'octocat' },
                { column: 'labels', op: 'eq', value: 'bug' },
                {
                    column: 'closed_at',
                    op: 'between',
                    start: '2026-10-01',
                    end: '2026-10-31',
                },
            ],
            columns: ['number', 'comments', 'state_reason'],
        });

        expect(send.mock.calls[0][0]).toMatchObject({
            path: '/repos/lightdash/lightdash/issues',
            query: {
                state: 'all',
                sort: 'updated',
                direction: 'desc',
                since: '2026-10-01T00:00:00Z',
                creator: 'octocat',
                labels: 'bug',
            },
        });
        expect(result.rows).toEqual([
            { number: 9, comments: 2, state_reason: 'completed' },
        ]);
    });

    it('reads pull request comments from the issue list', async () => {
        const { source, send } = connect(
            response([item(5), item(4, { pull_request: undefined })]),
        );

        const result = await run(source, {
            kind: 'list',
            type: 'pr',
            filters: [{ column: 'comments', op: 'gt', value: 1 }],
            columns: ['number', 'comments'],
        });

        expect(send.mock.calls[0][0].path).toBe(
            '/repos/lightdash/lightdash/issues',
        );
        expect(result.rows).toEqual([{ number: 5, comments: 2 }]);
    });

    it('applies filters the list cannot on each page', async () => {
        const { source } = connect(
            response([
                item(3, { user: { login: 'bot' } }),
                item(2, { pull_request: { merged_at: null }, draft: true }),
                item(1, { pull_request: { merged_at: null } }),
            ]),
        );

        const result = await run(source, {
            kind: 'list',
            type: 'pr',
            filters: [
                { column: 'author', op: 'neq', value: 'bot' },
                { column: 'state', op: 'eq', value: 'closed' },
                { column: 'draft', op: 'eq', value: false },
            ],
            columns: ['number'],
        });

        expect(result.rows).toEqual([{ number: 1 }]);
    });

    it('stops at one row past the limit', async () => {
        const { source, send } = connect(
            response(
                Array.from({ length: 100 }, (_, i) =>
                    pull(100 - i, '2026-10-01'),
                ),
            ),
        );

        const result = await run(
            source,
            { kind: 'list', type: 'pr', filters: [], columns: ['number'] },
            5,
        );

        expect(send).toHaveBeenCalledTimes(1);
        expect(result.rows).toHaveLength(5);
        expect(result.hasMoreRows).toBe(true);
    });

    it('refuses a range with more items than one query lists', async () => {
        const { source, send } = connect();
        send.mockResolvedValue(
            response(
                Array.from({ length: 100 }, (_, i) =>
                    pull(i + 1, '2025-06-10'),
                ),
            ),
        );

        await expect(
            run(source, {
                kind: 'list',
                type: 'pr',
                filters: [createdIn('2024-01-01', '2025-12-31')],
                columns: ['total_count'],
            }),
        ).rejects.toThrow(
            'This GitHub query reads more than 5,000 pull requests, the most one query lists. Filter Created or Updated to a shorter, more recent range.',
        );
        expect(send).toHaveBeenCalledTimes(GITHUB_LIST_MAX_PAGES);
    });
});

describe('githubIntegration contributors', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('sums commits per author over the weeks in range, most first', async () => {
        const { source, send } = connect(response(STATS));

        const result = await run(source, {
            kind: 'contributors',
            columns: ['author', 'commits', 'additions'],
            since: '2026-10-01',
            until: '2026-10-31',
        });

        expect(send).toHaveBeenCalledWith({
            method: 'GET',
            path: '/repos/lightdash/lightdash/stats/contributors',
            body: undefined,
        });
        // The week of 27 September holds 1 October, so it counts
        expect(result.rows).toEqual([
            { author: 'grace', commits: 13, additions: 2 },
            { author: 'ada', commits: 5, additions: 15 },
            { author: 'ghost', commits: 1, additions: 0 },
        ]);
    });

    it('groups by week, dropping empty weeks and excluded authors', async () => {
        const { source } = connect(response(STATS));

        const result = await run(source, {
            kind: 'contributors',
            columns: ['week', 'commits'],
            excludeAuthors: ['ghost'],
        });

        expect(result.rows).toEqual([
            { week: '2026-10-04', commits: 12 },
            { week: '2026-09-27', commits: 4 },
            { week: '2026-10-18', commits: 2 },
        ]);
    });

    it('asks again while GitHub computes the statistics', async () => {
        vi.useFakeTimers();
        const { source, send } = connect(
            response({}, 202),
            response({}, 202),
            response(STATS),
        );

        const result = run(source, {
            kind: 'contributors',
            columns: ['author', 'commits'],
            authors: ['ada'],
        });
        await vi.advanceTimersByTimeAsync(
            GITHUB_STATS_RETRY_DELAYS_MS[0] + GITHUB_STATS_RETRY_DELAYS_MS[1],
        );

        await expect(result).resolves.toMatchObject({
            rows: [{ author: 'ada', commits: 5 }],
        });
        expect(send).toHaveBeenCalledTimes(3);
    });

    it('says to try again when the statistics are still not ready', async () => {
        vi.useFakeTimers();
        const { source, send } = connect(
            ...GITHUB_STATS_RETRY_DELAYS_MS.map(() => response({}, 202)),
            response({}, 202),
        );

        const result = run(source, {
            kind: 'contributors',
            columns: ['author', 'commits'],
        });
        // Caught now, so the rejection isn't unhandled while timers run
        const failure = result.catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(
            GITHUB_STATS_RETRY_DELAYS_MS.reduce((sum, ms) => sum + ms, 0),
        );

        const error = await failure;
        expect(error).toBeInstanceOf(WarehouseQueryError);
        expect(String(error)).toMatch(/Try again in a minute/);
        expect(send).toHaveBeenCalledTimes(
            GITHUB_STATS_RETRY_DELAYS_MS.length + 1,
        );
    });

    it('reads an empty repository as no rows', async () => {
        const { source } = connect(response(undefined, 204));

        const result = await run(source, {
            kind: 'contributors',
            columns: ['author', 'commits'],
        });

        expect(result.rows).toEqual([]);
    });
});

describe('githubIntegration errors', () => {
    const count = {
        kind: 'search',
        type: 'pr',
        q: '',
        columns: ['total_count'],
    };

    it('explains a rejected token', async () => {
        const { source } = connect(
            response({ message: 'Bad credentials' }, 401),
        );
        await expect(run(source, count)).rejects.toBeInstanceOf(
            WarehouseConnectionError,
        );
    });

    it('explains a repository the token cannot read', async () => {
        const { source } = connect(response({ message: 'Not Found' }, 404));
        await expect(run(source, count)).rejects.toThrow(
            /can't read lightdash\/lightdash/,
        );
    });

    it('reports the search rate limit with when to retry', async () => {
        const { source } = connect(
            response({ message: 'API rate limit exceeded' }, 403, {
                'x-ratelimit-remaining': '0',
                'retry-after': '30',
            }),
        );
        await expect(run(source, count)).rejects.toMatchObject({
            constructor: TooManyRequestsError,
            data: { retryAfterSeconds: 30 },
        });
    });

    it('explains an invalid search', async () => {
        const { source } = connect(
            response(
                {
                    message: 'Validation Failed',
                    errors: [{ message: 'The search is longer than 256' }],
                },
                422,
            ),
        );
        await expect(run(source, count)).rejects.toBeInstanceOf(
            WarehouseQueryError,
        );
    });

    it('reports a server error as unexpected', async () => {
        const { source } = connect(response({}, 502));
        await expect(run(source, count)).rejects.toBeInstanceOf(
            UnexpectedServerError,
        );
    });
});
