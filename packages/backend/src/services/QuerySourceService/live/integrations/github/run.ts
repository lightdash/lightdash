import {
    ApiConnectorType,
    DimensionType,
    getGithubContributorsPath,
    GITHUB_SEARCH_PATH,
    ParameterError,
    WarehouseQueryError,
} from '@lightdash/common';
import { z } from 'zod';
import { assertMaxRows } from '../../integration';
import { readRowsWithinCap } from '../../query/rows';
import {
    type LiveCalls,
    type LiveColumn,
    type LiveRunArgs,
    type LiveRunResult,
} from '../../types';

const LABEL = 'GitHub';

/** Search reads 100 results a page and at most 1,000 in all. */
const SEARCH_PAGE_SIZE = 100;
const SEARCH_RESULT_CAP = 1_000;
export const GITHUB_SEARCH_MAX_PAGES = SEARCH_RESULT_CAP / SEARCH_PAGE_SIZE;

/**
 * The most rows one query can return: one fewer than search's 1,000, so
 * reading every page detects truncation.
 */
export const GITHUB_MAX_QUERY_ROWS = SEARCH_RESULT_CAP - 1;

/** Waits between asks while GitHub computes contributor statistics. */
export const GITHUB_STATS_RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

export const GITHUB_CALLS_PER_QUERY = Math.max(
    GITHUB_SEARCH_MAX_PAGES,
    GITHUB_STATS_RETRY_DELAYS_MS.length + 1,
);

const SEARCH_COLUMNS = [
    'number',
    'title',
    'url',
    'state',
    'author',
    'assignee',
    'labels',
    'draft',
    'comments',
    'created_at',
    'updated_at',
    'closed_at',
    'merged_at',
    'state_reason',
    'search',
] as const;
type SearchColumn = (typeof SEARCH_COLUMNS)[number];

const CONTRIBUTOR_COLUMNS = [
    'author',
    'week',
    'commits',
    'additions',
    'deletions',
] as const;
type ContributorColumn = (typeof CONTRIBUTOR_COLUMNS)[number];
const CONTRIBUTOR_METRICS = ['commits', 'additions', 'deletions'] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// The source fixes the repository and the type
const SCOPE_QUALIFIER =
    /(^|\s)-?(repo|org|user|owner):|(^|\s)-?(is|type):(pr|pull-request|issue)\b/i;

const searchRequestSchema = z
    .object({
        kind: z.literal('search'),
        type: z.enum(['pr', 'issue']),
        q: z.string().refine((q) => !SCOPE_QUALIFIER.test(q), {
            message:
                'q must not set repo:, org:, user: or is:pr; the source adds the repository and the type',
        }),
        columns: z.union([
            z.tuple([z.literal('total_count')]),
            z.array(z.enum(SEARCH_COLUMNS)).min(1),
        ]),
        sort: z.enum(['created', 'updated', 'comments']).optional(),
        order: z.enum(['asc', 'desc']).optional(),
        // Agents sometimes copy a limit in; the smaller limit wins
        limit: z.number().int().positive().optional(),
    })
    .strict();

const contributorsRequestSchema = z
    .object({
        kind: z.literal('contributors'),
        columns: z.array(z.enum(CONTRIBUTOR_COLUMNS)).min(1),
        since: z.string().regex(ISO_DATE, 'Use YYYY-MM-DD').optional(),
        until: z.string().regex(ISO_DATE, 'Use YYYY-MM-DD').optional(),
        authors: z.array(z.string()).optional(),
        excludeAuthors: z.array(z.string()).optional(),
    })
    .strict();

/** One GitHub request, as compile writes it and agents send it. */
export const githubRequestSchema = z.discriminatedUnion('kind', [
    searchRequestSchema,
    contributorsRequestSchema,
]);

export type GithubRequest = z.infer<typeof githubRequestSchema>;
type GithubSearchRequest = z.infer<typeof searchRequestSchema>;
type GithubContributorsRequest = z.infer<typeof contributorsRequestSchema>;

const userSchema = z.object({ login: z.string() }).nullable().optional();

const searchItemSchema = z.object({
    number: z.number(),
    title: z.string(),
    html_url: z.string(),
    state: z.string(),
    state_reason: z.string().nullable().optional(),
    user: userSchema,
    assignee: userSchema,
    labels: z.array(z.object({ name: z.string() })).optional(),
    draft: z.boolean().optional(),
    comments: z.number(),
    created_at: z.string(),
    updated_at: z.string(),
    closed_at: z.string().nullable(),
    pull_request: z
        .object({ merged_at: z.string().nullable().optional() })
        .optional(),
});
type SearchItem = z.infer<typeof searchItemSchema>;

const searchResponseSchema = z.object({
    total_count: z.number(),
    items: z.array(searchItemSchema),
});

const contributorsResponseSchema = z.array(
    z.object({
        author: userSchema,
        weeks: z.array(
            z.object({
                w: z.number(),
                a: z.number(),
                d: z.number(),
                c: z.number(),
            }),
        ),
    }),
);

const toDay = (timestamp: string | null | undefined) =>
    timestamp ? timestamp.slice(0, 10) : null;

const toState = (item: SearchItem) => {
    if (item.pull_request?.merged_at) {
        return 'merged';
    }
    return item.state;
};

const readSearchColumn = (item: SearchItem, column: SearchColumn): unknown => {
    switch (column) {
        case 'number':
            return item.number;
        case 'title':
            return item.title;
        case 'url':
            return item.html_url;
        case 'state':
            return toState(item);
        case 'author':
            return item.user?.login ?? null;
        case 'assignee':
            return item.assignee?.login ?? null;
        case 'labels':
            return (item.labels ?? []).map(({ name }) => name).join(', ');
        case 'draft':
            return item.draft ?? false;
        case 'comments':
            return item.comments;
        case 'created_at':
            return toDay(item.created_at);
        case 'updated_at':
            return toDay(item.updated_at);
        case 'closed_at':
            return toDay(item.closed_at);
        case 'merged_at':
            return toDay(item.pull_request?.merged_at);
        case 'state_reason':
            return item.state_reason ?? null;
        case 'search':
            // A filter, not a value of the row
            return null;
        default:
            return null;
    }
};

const SEARCH_COLUMN_TYPES: Partial<Record<SearchColumn, DimensionType>> = {
    number: DimensionType.NUMBER,
    comments: DimensionType.NUMBER,
    draft: DimensionType.BOOLEAN,
    created_at: DimensionType.DATE,
    updated_at: DimensionType.DATE,
    closed_at: DimensionType.DATE,
    merged_at: DimensionType.DATE,
};

/** The full search: the source's repository and type, then the request's qualifiers. */
export const toGithubSearchQuery = (
    { owner, repo }: { owner: string; repo: string },
    { type, q }: Pick<GithubSearchRequest, 'type' | 'q'>,
) =>
    [`repo:${owner}/${repo}`, `is:${type}`, q.trim()].filter(Boolean).join(' ');

const runSearch = async ({
    settings,
    request,
    limit,
    calls,
}: {
    settings: { owner: string; repo: string };
    request: GithubSearchRequest;
    limit: number;
    calls: LiveCalls;
}): Promise<LiveRunResult> => {
    const q = toGithubSearchQuery(settings, request);
    const sortQuery = {
        ...(request.sort ? { sort: request.sort } : {}),
        ...(request.order ? { order: request.order } : {}),
    };
    const { columns } = request;
    if (columns[0] === 'total_count') {
        const { total_count: totalCount } = await calls.fetch(
            {
                method: 'GET',
                path: GITHUB_SEARCH_PATH,
                query: { q, per_page: '1' },
                body: undefined,
            },
            searchResponseSchema,
        );
        return {
            columns: [{ name: 'total_count', type: DimensionType.NUMBER }],
            rows: [{ total_count: totalCount }],
            hasMoreRows: false,
        };
    }
    const searchColumns = columns as SearchColumn[];
    const requestedRows = Math.min(limit, request.limit ?? limit);
    // Pages are numbered, so every page asks for the same size
    const perPage = Math.min(SEARCH_PAGE_SIZE, requestedRows + 1);
    const { rows, hasMoreRows } = await readRowsWithinCap({
        label: LABEL,
        requestedRows,
        maxRows: GITHUB_MAX_QUERY_ROWS,
        pageSize: perPage,
        maxPages: GITHUB_SEARCH_MAX_PAGES,
        fetchPage: async ({ cursor }) => {
            const page = cursor ? Number(cursor) : 1;
            const response = await calls.fetch(
                {
                    method: 'GET',
                    path: GITHUB_SEARCH_PATH,
                    query: {
                        q,
                        ...sortQuery,
                        per_page: String(perPage),
                        page: String(page),
                    },
                    body: undefined,
                },
                searchResponseSchema,
            );
            const reachable = Math.min(response.total_count, SEARCH_RESULT_CAP);
            const hasNextPage =
                response.items.length === perPage && page * perPage < reachable;
            return {
                rows: response.items.map((item) =>
                    Object.fromEntries(
                        searchColumns.map((column) => [
                            column,
                            readSearchColumn(item, column),
                        ]),
                    ),
                ),
                nextCursor: hasNextPage ? String(page + 1) : undefined,
            };
        },
    });
    return {
        columns: searchColumns.map(
            (name): LiveColumn => ({
                name,
                type: SEARCH_COLUMN_TYPES[name] ?? DimensionType.STRING,
            }),
        ),
        rows,
        hasMoreRows,
    };
};

const wait = (ms: number) =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });

/**
 * Reads contributor statistics. GitHub answers 202 while it computes them
 * for a repository nobody asked about lately, so it asks a few times.
 */
const fetchContributorStats = async (
    { owner, repo }: { owner: string; repo: string },
    calls: LiveCalls,
) => {
    const path = getGithubContributorsPath(owner, repo);
    for (let attempt = 0; ; attempt += 1) {
        // eslint-disable-next-line no-await-in-loop
        const response = await calls.send({
            method: 'GET',
            path,
            body: undefined,
        });
        if (response.status !== 202) {
            const parsed = contributorsResponseSchema.safeParse(
                // An empty repository answers 204 with no body
                response.status === 204 ? [] : response.body,
            );
            if (!parsed.success) {
                throw new WarehouseQueryError(
                    `GitHub returned contributor statistics in an unexpected shape for ${owner}/${repo}.`,
                );
            }
            return parsed.data;
        }
        if (attempt >= GITHUB_STATS_RETRY_DELAYS_MS.length) {
            throw new WarehouseQueryError(
                `GitHub is still computing contributor statistics for ${owner}/${repo}. Try again in a minute.`,
            );
        }
        // eslint-disable-next-line no-await-in-loop
        await wait(GITHUB_STATS_RETRY_DELAYS_MS[attempt]);
    }
};

const DAY_MS = 86_400_000;

/** The Sunday on or before `isoDate`, the day GitHub starts its weeks. */
const toWeekStart = (isoDate: string) => {
    const date = new Date(`${isoDate}T00:00:00Z`);
    return new Date(date.getTime() - date.getUTCDay() * DAY_MS)
        .toISOString()
        .slice(0, 10);
};

const runContributors = async ({
    settings,
    request,
    limit,
    calls,
}: {
    settings: { owner: string; repo: string };
    request: GithubContributorsRequest;
    limit: number;
    calls: LiveCalls;
}): Promise<LiveRunResult> => {
    const stats = await fetchContributorStats(settings, calls);
    const columns = request.columns as ContributorColumn[];
    const groupBy = columns.filter(
        (column): column is 'author' | 'week' =>
            column === 'author' || column === 'week',
    );
    const since = request.since ? toWeekStart(request.since) : null;
    const authors = request.authors ? new Set(request.authors) : null;
    const excluded = new Set(request.excludeAuthors ?? []);

    const groups = new Map<string, Record<string, unknown>>();
    stats.forEach(({ author, weeks }) => {
        // Deleted accounts show as GitHub's ghost user
        const login = author?.login ?? 'ghost';
        if ((authors && !authors.has(login)) || excluded.has(login)) {
            return;
        }
        weeks.forEach(({ w, a, d, c }) => {
            const week = new Date(w * 1000).toISOString().slice(0, 10);
            const isInRange =
                (!since || week >= since) &&
                (!request.until || week <= request.until);
            if (!isInRange || (a === 0 && d === 0 && c === 0)) {
                return;
            }
            const values = { author: login, week };
            const key = groupBy.map((column) => values[column]).join('\u0000');
            const group = groups.get(key) ?? {
                ...Object.fromEntries(
                    groupBy.map((column) => [column, values[column]]),
                ),
                commits: 0,
                additions: 0,
                deletions: 0,
            };
            group.commits = Number(group.commits) + c;
            group.additions = Number(group.additions) + a;
            group.deletions = Number(group.deletions) + d;
            groups.set(key, group);
        });
    });

    // Most commits first, the order a contributors chart wants
    const rows = [...groups.values()]
        .sort((left, right) => Number(right.commits) - Number(left.commits))
        .map((group) =>
            Object.fromEntries(
                columns.map((column) => [column, group[column]]),
            ),
        );
    return {
        columns: columns.map(
            (name): LiveColumn => ({
                name,
                type: CONTRIBUTOR_METRICS.some((metric) => metric === name)
                    ? DimensionType.NUMBER
                    : (name === 'week' && DimensionType.DATE) ||
                      DimensionType.STRING,
            }),
        ),
        rows: rows.slice(0, limit),
        hasMoreRows: rows.length > limit,
    };
};

/** Runs one GitHub request: a search, or contributor statistics. */
export const runGithubQuery = async ({
    settings,
    request,
    limit,
    calls,
}: LiveRunArgs<
    ApiConnectorType.GITHUB,
    GithubRequest
>): Promise<LiveRunResult> => {
    assertMaxRows(limit, GITHUB_MAX_QUERY_ROWS);
    switch (request.kind) {
        case 'search':
            return runSearch({ settings, request, limit, calls });
        case 'contributors':
            return runContributors({ settings, request, limit, calls });
        default:
            throw new ParameterError('Unknown GitHub request kind');
    }
};
