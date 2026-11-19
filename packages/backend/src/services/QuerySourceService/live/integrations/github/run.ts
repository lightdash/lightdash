import {
    ApiConnectorType,
    DimensionType,
    getGithubContributorsPath,
    getGithubIssuesPath,
    getGithubPullsPath,
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

/** Search can return one fewer than its 1,000, so reading every page detects truncation. */
const SEARCH_MAX_ROWS = SEARCH_RESULT_CAP - 1;

/** The REST lists read 100 a page; one query reads at most 50 pages. */
const LIST_PAGE_SIZE = 100;
export const GITHUB_LIST_MAX_PAGES = 50;

/**
 * The most rows one query can return: one fewer than the items one list
 * query reads, so reading every page detects truncation. Search stops at
 * its own 999.
 */
export const GITHUB_MAX_QUERY_ROWS = GITHUB_LIST_MAX_PAGES * LIST_PAGE_SIZE - 1;

/** Waits between asks while GitHub computes contributor statistics. */
export const GITHUB_STATS_RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

export const GITHUB_CALLS_PER_QUERY = Math.max(
    GITHUB_LIST_MAX_PAGES,
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

const LIST_DATE_COLUMNS = [
    'created_at',
    'updated_at',
    'closed_at',
    'merged_at',
] as const;
type ListDateColumn = (typeof LIST_DATE_COLUMNS)[number];

const valueFilterSchema = z
    .object({
        column: z.enum([
            'author',
            'assignee',
            'labels',
            'state',
            'state_reason',
        ]),
        op: z.enum(['eq', 'neq']),
        value: z.string().min(1),
    })
    .strict();

const draftFilterSchema = z
    .object({
        column: z.literal('draft'),
        op: z.literal('eq'),
        value: z.boolean(),
    })
    .strict();

const commentsFilterSchema = z
    .object({
        column: z.literal('comments'),
        op: z.enum(['eq', 'gt', 'lt']),
        value: z.number().int().nonnegative(),
    })
    .strict();

/** Inclusive UTC days. */
const dateFilterSchema = z
    .object({
        column: z.enum(LIST_DATE_COLUMNS),
        op: z.literal('between'),
        start: z.string().regex(ISO_DATE, 'Use YYYY-MM-DD'),
        end: z.string().regex(ISO_DATE, 'Use YYYY-MM-DD'),
    })
    .strict();

const listFilterSchema = z.union([
    valueFilterSchema,
    draftFilterSchema,
    commentsFilterSchema,
    dateFilterSchema,
]);
export type GithubListFilter = z.infer<typeof listFilterSchema>;
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

/**
 * Pull requests or issues from the REST lists, which cover the whole
 * history; search's index misses older items. Filters the lists can't
 * apply are applied to each page read.
 */
const listRequestSchema = z
    .object({
        kind: z.literal('list'),
        type: z.enum(['pr', 'issue']),
        filters: z.array(listFilterSchema),
        columns: z.union([
            z.tuple([z.literal('total_count')]),
            z.array(z.enum(SEARCH_COLUMNS)).min(1),
        ]),
        sort: z.enum(['created', 'updated']).optional(),
        order: z.enum(['asc', 'desc']).optional(),
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
    listRequestSchema,
    contributorsRequestSchema,
]);

export type GithubRequest = z.infer<typeof githubRequestSchema>;
type GithubSearchRequest = z.infer<typeof searchRequestSchema>;
type GithubListRequest = z.infer<typeof listRequestSchema>;
type GithubContributorsRequest = z.infer<typeof contributorsRequestSchema>;

const userSchema = z.object({ login: z.string() }).nullable().optional();

/** An item of search, the issues list or the pulls list. */
const searchItemSchema = z.object({
    number: z.number(),
    title: z.string(),
    html_url: z.string(),
    state: z.string(),
    state_reason: z.string().nullable().optional(),
    user: userSchema,
    assignee: userSchema,
    assignees: z
        .array(z.object({ login: z.string() }))
        .nullable()
        .optional(),
    labels: z.array(z.object({ name: z.string() })).optional(),
    draft: z.boolean().optional(),
    // The pulls list has no comment count
    comments: z.number().optional(),
    created_at: z.string(),
    updated_at: z.string(),
    closed_at: z.string().nullable(),
    // The pulls list has merged_at; search and the issues list nest it
    merged_at: z.string().nullable().optional(),
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

const getMergedAt = (item: SearchItem) =>
    item.merged_at ?? item.pull_request?.merged_at ?? null;

const toState = (item: SearchItem) =>
    getMergedAt(item) ? 'merged' : item.state;

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
            return item.comments ?? null;
        case 'created_at':
            return toDay(item.created_at);
        case 'updated_at':
            return toDay(item.updated_at);
        case 'closed_at':
            return toDay(item.closed_at);
        case 'merged_at':
            return toDay(getMergedAt(item));
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

const toSearchRow = (item: SearchItem, columns: SearchColumn[]) =>
    Object.fromEntries(
        columns.map((column) => [column, readSearchColumn(item, column)]),
    );

const toSearchColumns = (columns: SearchColumn[]) =>
    columns.map(
        (name): LiveColumn => ({
            name,
            type: SEARCH_COLUMN_TYPES[name] ?? DimensionType.STRING,
        }),
    );

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
        maxRows: SEARCH_MAX_ROWS,
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
                    toSearchRow(item, searchColumns),
                ),
                nextCursor: hasNextPage ? String(page + 1) : undefined,
            };
        },
    });
    return { columns: toSearchColumns(searchColumns), rows, hasMoreRows };
};

const getAssignees = (item: SearchItem) =>
    item.assignees?.map(({ login }) => login) ??
    (item.assignee ? [item.assignee.login] : []);

const getDay = (item: SearchItem, column: ListDateColumn) =>
    column === 'merged_at' ? toDay(getMergedAt(item)) : toDay(item[column]);

const matchesFilter = (item: SearchItem, filter: GithubListFilter): boolean => {
    switch (filter.column) {
        case 'draft':
            return (item.draft ?? false) === filter.value;
        case 'comments': {
            const comments = item.comments ?? 0;
            if (filter.op === 'gt') return comments > filter.value;
            if (filter.op === 'lt') return comments < filter.value;
            return comments === filter.value;
        }
        case 'created_at':
        case 'updated_at':
        case 'closed_at':
        case 'merged_at': {
            const day = getDay(item, filter.column);
            return day !== null && day >= filter.start && day <= filter.end;
        }
        default: {
            const values: Record<typeof filter.column, string[]> = {
                author: item.user ? [item.user.login] : [],
                assignee: getAssignees(item),
                labels: (item.labels ?? []).map(({ name }) => name),
                state: [toState(item)],
                state_reason: item.state_reason ? [item.state_reason] : [],
            };
            const has = values[filter.column].includes(filter.value);
            return filter.op === 'eq' ? has : !has;
        }
    }
};

type DateFilter = Extract<GithubListFilter, { op: 'between' }>;

const isDateFilter = (filter: GithubListFilter): filter is DateFilter =>
    filter.op === 'between';

const findEquals = (
    filters: GithubListFilter[],
    column: 'author' | 'assignee' | 'labels' | 'state',
) =>
    filters.find(
        (filter): filter is z.infer<typeof valueFilterSchema> =>
            filter.column === column && filter.op === 'eq',
    )?.value;

/**
 * How a list is read: the order GitHub returns it in, the parameters that
 * narrow it, and the day past which no later item can match.
 */
const toListPlan = (request: GithubListRequest) => {
    const dateFilters = request.filters.filter(isDateFilter);
    const created = dateFilters.find(({ column }) => column === 'created_at');
    // Anything updated, closed or merged since a day was updated since it
    const updatedSince = dateFilters
        .filter(({ column }) => column !== 'created_at')
        .map(({ start }) => start)
        .sort()
        .at(-1);
    const sort =
        request.sort ?? (created || !updatedSince ? 'created' : 'updated');
    const direction = request.sort ? (request.order ?? 'desc') : 'desc';
    const bound = ((): {
        column: 'created_at' | 'updated_at';
        side: 'before' | 'after';
        day: string;
    } | null => {
        if (sort === 'created' && created) {
            return direction === 'desc'
                ? { column: 'created_at', side: 'before', day: created.start }
                : { column: 'created_at', side: 'after', day: created.end };
        }
        if (sort === 'updated' && updatedSince && direction === 'desc') {
            return { column: 'updated_at', side: 'before', day: updatedSince };
        }
        return null;
    })();
    return { sort, direction, updatedSince, bound };
};

const isPastBound = (
    item: SearchItem,
    bound: ReturnType<typeof toListPlan>['bound'],
) => {
    if (!bound) return false;
    const day = toDay(item[bound.column]);
    if (day === null) return false;
    return bound.side === 'before' ? day < bound.day : day > bound.day;
};

const listResponseSchema = z.array(searchItemSchema);

/** The lists filter open or closed; merged and unmerged are told apart per item. */
const toListState = (state: string | undefined) => {
    if (state === undefined) return 'all';
    return state === 'open' ? 'open' : 'closed';
};

/**
 * Reads pull requests or issues from the REST lists, newest first unless a
 * sort says otherwise, until the date filters are covered or the limit has
 * one row to spare. Search's index misses older items, so it is used only
 * for the word filters it alone can apply.
 */
const runList = async ({
    settings: { owner, repo },
    request,
    limit,
    calls,
}: {
    settings: { owner: string; repo: string };
    request: GithubListRequest;
    limit: number;
    calls: LiveCalls;
}): Promise<LiveRunResult> => {
    const { type, filters, columns } = request;
    const isCount = columns[0] === 'total_count';
    const listColumns = isCount ? [] : (columns as SearchColumn[]);
    // The pulls list has no comment count; the issues list has it for both
    const readsIssues =
        type === 'issue' ||
        listColumns.includes('comments') ||
        filters.some(({ column }) => column === 'comments');
    const plan = toListPlan(request);
    const state = findEquals(filters, 'state');
    const author = findEquals(filters, 'author');
    const assignee = findEquals(filters, 'assignee');
    const label = findEquals(filters, 'labels');
    const query: Record<string, string> = {
        state: toListState(state),
        sort: plan.sort,
        direction: plan.direction,
        per_page: String(LIST_PAGE_SIZE),
        ...(readsIssues && plan.updatedSince
            ? { since: `${plan.updatedSince}T00:00:00Z` }
            : {}),
        ...(readsIssues && author ? { creator: author } : {}),
        ...(readsIssues && assignee ? { assignee } : {}),
        ...(readsIssues && label ? { labels: label } : {}),
    };
    const path = readsIssues
        ? getGithubIssuesPath(owner, repo)
        : getGithubPullsPath(owner, repo);
    const rowLimit = isCount
        ? Infinity
        : Math.min(limit, request.limit ?? limit);
    const isOfType = (item: SearchItem) =>
        !readsIssues || (item.pull_request !== undefined) === (type === 'pr');

    const matches: SearchItem[] = [];
    let isComplete = false;
    for (
        let page = 1;
        page <= GITHUB_LIST_MAX_PAGES && !isComplete;
        page += 1
    ) {
        // eslint-disable-next-line no-await-in-loop
        const items = await calls.fetch(
            {
                method: 'GET',
                path,
                query: { ...query, page: String(page) },
                body: undefined,
            },
            listResponseSchema,
        );
        const pastBound = items.findIndex((item) =>
            isPastBound(item, plan.bound),
        );
        const inWindow = pastBound === -1 ? items : items.slice(0, pastBound);
        matches.push(
            ...inWindow.filter(
                (item) =>
                    isOfType(item) &&
                    filters.every((filter) => matchesFilter(item, filter)),
            ),
        );
        isComplete =
            pastBound !== -1 ||
            items.length < LIST_PAGE_SIZE ||
            matches.length > rowLimit;
    }
    if (!isComplete) {
        const noun = type === 'pr' ? 'pull requests' : 'issues';
        throw new ParameterError(
            `This GitHub query reads more than ${(
                GITHUB_LIST_MAX_PAGES * LIST_PAGE_SIZE
            ).toLocaleString(
                'en-US',
            )} ${noun}, the most one query lists. Filter Created or Updated to a shorter, more recent range.`,
        );
    }
    if (isCount) {
        return {
            columns: [{ name: 'total_count', type: DimensionType.NUMBER }],
            rows: [{ total_count: matches.length }],
            hasMoreRows: false,
        };
    }
    return {
        columns: toSearchColumns(listColumns),
        rows: matches
            .slice(0, rowLimit)
            .map((item) => toSearchRow(item, listColumns)),
        hasMoreRows: matches.length > rowLimit,
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

/** Runs one GitHub request: a list, a search, or contributor statistics. */
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
        case 'list':
            return runList({ settings, request, limit, calls });
        case 'contributors':
            return runContributors({ settings, request, limit, calls });
        default:
            throw new ParameterError('Unknown GitHub request kind');
    }
};
