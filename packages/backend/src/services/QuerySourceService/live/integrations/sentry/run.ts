import {
    DimensionType,
    getSentryPaths,
    ParameterError,
    UnexpectedServerError,
    type ApiConnectorType,
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
import { SENTRY_RETENTION_DAYS } from './explores';

const LABEL = 'Sentry';

/** Events and issues return 100 rows a page; sessions, 100 groups. */
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
/** Enough for an organization of 300 projects, when sessions name them. */
const MAX_PROJECT_PAGES = 3;

/**
 * The most rows one query can return: one fewer than ten pages hold, so
 * reading every page detects truncation.
 */
export const SENTRY_MAX_QUERY_ROWS = PAGE_SIZE * MAX_PAGES - 1;

export const SENTRY_CALLS_PER_QUERY = MAX_PAGES + MAX_PROJECT_PAGES;

/** The sessions API returns at most this many data points in one call. */
const SESSIONS_MAX_DATA_POINTS = 10_000;

type SentrySettings = { organizationSlug: string; projectSlugs: string[] };

/**
 * Each column's field in Sentry's errors dataset. A request names columns,
 * never Sentry fields, so a query can't read a field left out of here, such
 * as a user's ID, email or IP address.
 */
const ERROR_FIELDS = {
    date: 'timestamp.to_day',
    project: 'project',
    release: 'release',
    environment: 'environment',
    level: 'level',
    issue: 'issue',
    title: 'title',
    error_type: 'error.type',
    unhandled: 'error.unhandled',
    platform: 'platform.name',
    os_name: 'os.name',
    device_family: 'device.family',
    events: 'count()',
    issues: 'count_unique(issue)',
    users_affected: 'count_unique(user)',
} as const;
type ErrorColumn = keyof typeof ERROR_FIELDS;
const ERROR_COLUMNS = Object.keys(ERROR_FIELDS) as [
    ErrorColumn,
    ...ErrorColumn[],
];
const ERROR_METRICS: ErrorColumn[] = ['events', 'issues', 'users_affected'];

/**
 * Sentry refuses to order by an issue's short ID, so the issue's numeric ID
 * is read with it and ordered by instead.
 */
const ISSUE_ORDER_FIELD = 'issue.id';
const toErrorOrderField = (column: ErrorColumn) =>
    column === 'issue' ? ISSUE_ORDER_FIELD : ERROR_FIELDS[column];

const ISSUE_COLUMNS = [
    'short_id',
    'title',
    'culprit',
    'level',
    'status',
    'substatus',
    'priority',
    'project',
    'environment',
    'release',
    'platform',
    'category',
    'unhandled',
    'first_seen',
    'last_seen',
    'events',
    'users',
    'url',
] as const;
type IssueColumn = (typeof ISSUE_COLUMNS)[number];

const SESSION_FIELDS = {
    sessions: 'sum(session)',
    users: 'count_unique(user)',
    crash_free_sessions: 'crash_free_rate(session)',
    crash_free_users: 'crash_free_rate(user)',
} as const;
type SessionMetric = keyof typeof SESSION_FIELDS;
const SESSION_GROUPS = {
    project: 'project',
    release: 'release',
    environment: 'environment',
    session_status: 'session.status',
} as const;
type SessionGroup = keyof typeof SESSION_GROUPS;
type SessionColumn = 'date' | SessionGroup | SessionMetric;
const SESSION_COLUMNS: [SessionColumn, ...SessionColumn[]] = [
    'date',
    ...(Object.keys(SESSION_GROUPS) as SessionGroup[]),
    ...(Object.keys(SESSION_FIELDS) as SessionMetric[]),
];
const SESSION_RATES: SessionColumn[] = [
    'crash_free_sessions',
    'crash_free_users',
];

/** Each filter's key in Sentry's search syntax, per request kind. */
const SEARCH_KEYS = {
    errors: {
        release: 'release',
        level: 'level',
        issue: 'issue',
        title: 'title',
        error_type: 'error.type',
        unhandled: 'error.unhandled',
        platform: 'platform.name',
        os_name: 'os.name',
        device_family: 'device.family',
    },
    issues: {
        release: 'release',
        level: 'level',
        title: 'title',
        status: 'is',
        priority: 'issue.priority',
        category: 'issue.category',
        unhandled: 'error.unhandled',
    },
    sessions: { release: 'release' },
} as const;

const SCOPE_FILTERS = ['project', 'environment'] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const day = z.string().regex(ISO_DATE, 'Use YYYY-MM-DD');

const filterSchema = (fields: string[]) =>
    z
        .object({
            field: z.enum([...SCOPE_FILTERS, ...fields]),
            operator: z.enum(['is', 'is_not', 'contains', 'not_contains']),
            values: z.array(z.string()).min(1).max(50),
        })
        .strict()
        .refine(
            ({ field, operator }) =>
                operator === 'is' ||
                !SCOPE_FILTERS.some((scope) => scope === field),
            { message: 'project and environment filters take "is" only' },
        );

const dayRangeSchema = z
    .object({ start: day, end: day })
    .strict()
    .refine(({ start, end }) => start <= end, {
        message: 'start must be on or before end',
    });

const errorsRequestSchema = z
    .object({
        kind: z.literal('errors'),
        columns: z.array(z.enum(ERROR_COLUMNS)).min(1),
        /** First and last UTC day read, both included. */
        start: day,
        end: day,
        filters: z
            .array(filterSchema(Object.keys(SEARCH_KEYS.errors)))
            .optional(),
        sort: z
            .object({
                column: z.enum(ERROR_COLUMNS),
                descending: z.boolean(),
            })
            .strict()
            .optional(),
        // Agents sometimes copy a limit in; the smaller limit wins
        limit: z.number().int().positive().optional(),
    })
    .strict();

const issuesRequestSchema = z
    .object({
        kind: z.literal('issues'),
        columns: z.array(z.enum(ISSUE_COLUMNS)).min(1),
        filters: z
            .array(filterSchema(Object.keys(SEARCH_KEYS.issues)))
            .optional(),
        /** UTC days the first event falls in, both included. */
        firstSeen: dayRangeSchema.optional(),
        lastSeen: dayRangeSchema.optional(),
        /** Sentry's own orders, each newest or highest first. */
        sort: z.enum(['date', 'new', 'freq', 'user']).optional(),
        limit: z.number().int().positive().optional(),
    })
    .strict();

const sessionsRequestSchema = z
    .object({
        kind: z.literal('sessions'),
        columns: z.array(z.enum(SESSION_COLUMNS)).min(1),
        start: day,
        end: day,
        filters: z
            .array(filterSchema(Object.keys(SEARCH_KEYS.sessions)))
            .optional(),
    })
    .strict();

/** One Sentry request, as compile writes it and agents send it. */
export const sentryRequestSchema = z
    .discriminatedUnion('kind', [
        errorsRequestSchema,
        issuesRequestSchema,
        sessionsRequestSchema,
    ])
    .refine(
        (request) => request.kind === 'issues' || request.start <= request.end,
        { message: 'The date range starts after it ends' },
    )
    .refine(
        (request) =>
            request.kind !== 'errors' ||
            !request.sort ||
            request.columns.includes(request.sort.column),
        { message: 'sort.column must be one of columns' },
    )
    .refine(
        (request) =>
            request.kind !== 'sessions' ||
            !request.columns.includes('session_status') ||
            !request.columns.some((column) => SESSION_RATES.includes(column)),
        {
            message:
                'A crash-free rate has no value for one session status; read sessions by session_status instead',
        },
    );

export type SentryRequest = z.infer<typeof sentryRequestSchema>;
type SentryErrorsRequest = z.infer<typeof errorsRequestSchema>;
type SentryIssuesRequest = z.infer<typeof issuesRequestSchema>;
type SentrySessionsRequest = z.infer<typeof sessionsRequestSchema>;
export type SentryFilter = NonNullable<SentryErrorsRequest['filters']>[number];

type Params = [string, string][];

const toRawQuery = (params: Params) =>
    params
        .map(
            ([key, value]) =>
                `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
        )
        .join('&');

/** The cursor of the next page, when the Link header says it has results. */
export const getNextCursor = (link: string | undefined): string | undefined => {
    const next = (link ?? '')
        .split(',')
        .find((part) => /rel="next"/.test(part) && /results="true"/.test(part));
    return next?.match(/cursor="([^"]+)"/)?.[1];
};

const get = async <T>(
    calls: LiveCalls,
    path: string,
    params: Params,
    schema: z.ZodType<T>,
): Promise<{ data: T; nextCursor: string | undefined }> => {
    const response = await calls.send({
        method: 'GET',
        path,
        rawQuery: toRawQuery(params),
        body: undefined,
    });
    const parsed = schema.safeParse(response.body);
    if (!parsed.success) {
        throw new UnexpectedServerError(
            `${LABEL} returned a response in an unexpected shape`,
        );
    }
    return {
        data: parsed.data,
        nextCursor: getNextCursor(response.headers.link),
    };
};

const addDays = (isoDate: string, days: number) => {
    const date = new Date(`${isoDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
};

/** Whole UTC days as Sentry's range, which leaves its end out. */
const toRangeParams = ({ start, end }: { start: string; end: string }) =>
    [
        ['start', `${start}T00:00:00`],
        ['end', `${addDays(end, 1)}T00:00:00`],
    ] as Params;

/** A search value in quotes, where `*` is a character and not a wildcard. */
const quote = (value: string) =>
    `"${value.replace(/[\\"*]/g, (character) => `\\${character}`)}"`;

const toBoolean = (value: string) => {
    if (value === 'true' || value === 'false') return value;
    throw new ParameterError('unhandled filters take true or false');
};

const ISSUE_STATUSES: Record<string, string> = {
    unresolved: 'unresolved',
    resolved: 'resolved',
    ignored: 'archived',
    archived: 'archived',
};

/** One search term per filter; several values match any of them. */
const toSearchTerm = (key: string, { operator, values }: SentryFilter) => {
    const isNegative = operator === 'is_not' || operator === 'not_contains';
    const not = isNegative ? '!' : '';
    if (operator === 'contains' || operator === 'not_contains') {
        // Each value is its own term: any of them when kept, none when dropped
        const terms = values.map(
            (value) => `${not}${key}:"*${quote(value).slice(1, -1)}*"`,
        );
        return isNegative || terms.length === 1
            ? terms.join(' ')
            : `(${terms.join(' OR ')})`;
    }
    if (key === 'error.unhandled') {
        return `${not}${key}:${toBoolean(values[0])}`;
    }
    if (key === 'is') {
        if (values.length !== 1 || !Object.hasOwn(ISSUE_STATUSES, values[0])) {
            throw new ParameterError(
                'Status must be one of: unresolved, resolved, ignored.',
            );
        }
        return `${not}is:${ISSUE_STATUSES[values[0]]}`;
    }
    return values.length === 1
        ? `${not}${key}:${quote(values[0])}`
        : `${not}${key}:[${values.map(quote).join(',')}]`;
};

/**
 * The projects a request reads: the ones it filters by, or every project of
 * the source. Sentry reads all the token can when no project is named, so
 * every call names its projects, and none outside the source's.
 */
const getProjects = (
    { projectSlugs }: SentrySettings,
    filters: SentryFilter[],
): string[] => {
    const projectFilters = filters.filter(({ field }) => field === 'project');
    if (projectFilters.length === 0) return projectSlugs;
    const requested = projectFilters.map(
        ({ values }) => new Set(values.map((value) => value.trim())),
    );
    const outside = [...new Set(requested.flatMap((set) => [...set]))].filter(
        (slug) => !projectSlugs.includes(slug),
    );
    if (outside.length > 0) {
        throw new ParameterError(
            `This Sentry source reads only these projects: ${projectSlugs.join(', ')}. It can't read ${outside.join(', ')}.`,
        );
    }
    // Several project filters are ANDed: a project must match each of them
    const projects = projectSlugs.filter((slug) =>
        requested.every((set) => set.has(slug)),
    );
    if (projects.length === 0) {
        throw new ParameterError(
            'The project filters leave no project to read. Filter Project once.',
        );
    }
    return projects;
};

/** Projects and environments as parameters, everything else as one search. */
const toFilterParams = (
    kind: keyof typeof SEARCH_KEYS,
    settings: SentrySettings,
    filters: SentryFilter[] = [],
    extraTerms: string[] = [],
): Params => {
    const keys: Record<string, string> = SEARCH_KEYS[kind];
    const projects = getProjects(settings, filters);
    const scope = (field: (typeof SCOPE_FILTERS)[number]) =>
        filters
            .filter((filter) => filter.field === field)
            .flatMap(({ values }) =>
                values.map((value): [string, string] => [field, value.trim()]),
            );
    const terms = [
        ...filters
            .filter(({ field }) => Object.hasOwn(keys, field))
            .map((filter) => toSearchTerm(keys[filter.field], filter)),
        ...extraTerms,
    ];
    return [
        ...projects.map((slug): [string, string] => ['project', slug]),
        ...scope('environment'),
        // Sent even when empty: issues default to unresolved ones without it
        ['query', terms.join(' ')],
    ];
};

const toDay = (value: unknown) =>
    typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : null;

const toNumber = (value: unknown) => {
    const number = Number(value);
    return value === null || value === undefined || !Number.isFinite(number)
        ? null
        : number;
};

const toText = (value: unknown) => {
    if (Array.isArray(value)) {
        return value.length > 0 ? value.map(String).join(', ') : null;
    }
    return value === null || value === undefined || value === ''
        ? null
        : String(value);
};

const eventsResponseSchema = z.object({
    data: z.array(z.record(z.string(), z.unknown())),
});

const readErrorColumn = (
    row: Record<string, unknown>,
    column: ErrorColumn,
): unknown => {
    const value = row[ERROR_FIELDS[column]];
    if (ERROR_METRICS.includes(column)) return toNumber(value) ?? 0;
    switch (column) {
        case 'date':
            return toDay(value);
        case 'unhandled':
            return value === null || value === undefined
                ? null
                : value === true || value === 1 || value === '1';
        default:
            return toText(value);
    }
};

const ERROR_COLUMN_TYPES: Partial<Record<ErrorColumn, DimensionType>> = {
    date: DimensionType.DATE,
    unhandled: DimensionType.BOOLEAN,
    events: DimensionType.NUMBER,
    issues: DimensionType.NUMBER,
    users_affected: DimensionType.NUMBER,
};

const runErrors = async ({
    settings,
    request,
    limit,
    calls,
}: {
    settings: SentrySettings;
    request: SentryErrorsRequest;
    limit: number;
    calls: LiveCalls;
}): Promise<LiveRunResult> => {
    const { columns, sort } = request;
    // Sentry groups rows only when a function is selected; without one it
    // lists events one by one
    const fields = [
        ...columns.map((column) => ERROR_FIELDS[column]),
        ...(columns.some((column) => ERROR_METRICS.includes(column))
            ? []
            : [ERROR_FIELDS.events]),
        ...(columns.includes('issue') ? [ISSUE_ORDER_FIELD] : []),
    ];
    // Pages are cut by row offset, so rows that tie in the order can repeat
    // on the next page. Every other selected dimension breaks the ties.
    const sorts = [
        ...(sort
            ? [`${sort.descending ? '-' : ''}${toErrorOrderField(sort.column)}`]
            : []),
        ...columns
            .filter(
                (column) =>
                    !ERROR_METRICS.includes(column) && column !== sort?.column,
            )
            .map(toErrorOrderField),
    ];
    const params: Params = [
        ['dataset', 'errors'],
        ...fields.map((field): [string, string] => ['field', field]),
        ...toRangeParams(request),
        ...toFilterParams('errors', settings, request.filters),
        ...sorts.map((field): [string, string] => ['sort', field]),
    ];
    const { rows, hasMoreRows } = await readRowsWithinCap({
        label: LABEL,
        requestedRows: Math.min(limit, request.limit ?? limit),
        maxRows: SENTRY_MAX_QUERY_ROWS,
        pageSize: PAGE_SIZE,
        maxPages: MAX_PAGES,
        fetchPage: async ({ limit: perPage, cursor }) => {
            const { data, nextCursor } = await get(
                calls,
                getSentryPaths(settings.organizationSlug).events,
                [
                    ...params,
                    ['per_page', String(perPage)],
                    ...(cursor ? ([['cursor', cursor]] as Params) : []),
                ],
                eventsResponseSchema,
            );
            return {
                rows: data.data.map((row) =>
                    Object.fromEntries(
                        columns.map((column) => [
                            column,
                            readErrorColumn(row, column),
                        ]),
                    ),
                ),
                nextCursor,
            };
        },
    });
    return {
        columns: columns.map(
            (name): LiveColumn => ({
                name,
                type: ERROR_COLUMN_TYPES[name] ?? DimensionType.STRING,
            }),
        ),
        rows,
        hasMoreRows,
    };
};

// Only what a column reads is kept: the assignee, owners and the people who
// saw or commented on an issue are dropped here
const issueSchema = z.object({
    shortId: z.string(),
    title: z.string().nullish(),
    culprit: z.string().nullish(),
    level: z.string().nullish(),
    status: z.string().nullish(),
    substatus: z.string().nullish(),
    priority: z.string().nullish(),
    project: z.object({ slug: z.string() }).nullish(),
    platform: z.string().nullish(),
    issueCategory: z.string().nullish(),
    isUnhandled: z.boolean().nullish(),
    firstSeen: z.string().nullish(),
    lastSeen: z.string().nullish(),
    count: z.union([z.string(), z.number()]).nullish(),
    userCount: z.number().nullish(),
    permalink: z.string().nullish(),
});
type SentryIssue = z.infer<typeof issueSchema>;

const issuesResponseSchema = z.array(issueSchema);

const readIssueColumn = (issue: SentryIssue, column: IssueColumn): unknown => {
    switch (column) {
        case 'short_id':
            return issue.shortId;
        case 'title':
            return toText(issue.title);
        case 'culprit':
            return toText(issue.culprit);
        case 'level':
            return toText(issue.level);
        case 'status':
            return toText(issue.status);
        case 'substatus':
            return toText(issue.substatus);
        case 'priority':
            return toText(issue.priority);
        case 'project':
            return issue.project?.slug ?? null;
        case 'platform':
            return toText(issue.platform);
        case 'category':
            return toText(issue.issueCategory);
        case 'unhandled':
            return issue.isUnhandled ?? null;
        case 'first_seen':
            return toDay(issue.firstSeen);
        case 'last_seen':
            return toDay(issue.lastSeen);
        case 'events':
            return toNumber(issue.count);
        case 'users':
            return toNumber(issue.userCount);
        case 'url':
            return toText(issue.permalink);
        case 'environment':
        case 'release':
            // Filters, not values of the row
            return null;
        default:
            return null;
    }
};

const ISSUE_COLUMN_TYPES: Partial<Record<IssueColumn, DimensionType>> = {
    unhandled: DimensionType.BOOLEAN,
    first_seen: DimensionType.DATE,
    last_seen: DimensionType.DATE,
    events: DimensionType.NUMBER,
    users: DimensionType.NUMBER,
};

/** Whole UTC days as two search terms on one of an issue's dates. */
const toSeenTerms = (
    key: 'firstSeen' | 'lastSeen',
    range: { start: string; end: string } | undefined,
) =>
    range
        ? [
              `${key}:>=${range.start}T00:00:00Z`,
              `${key}:<${addDays(range.end, 1)}T00:00:00Z`,
          ]
        : [];

const runIssues = async ({
    settings,
    request,
    limit,
    calls,
}: {
    settings: SentrySettings;
    request: SentryIssuesRequest;
    limit: number;
    calls: LiveCalls;
}): Promise<LiveRunResult> => {
    const { columns } = request;
    const params: Params = [
        ...toFilterParams('issues', settings, request.filters, [
            ...toSeenTerms('firstSeen', request.firstSeen),
            ...toSeenTerms('lastSeen', request.lastSeen),
        ]),
        ['statsPeriod', `${SENTRY_RETENTION_DAYS}d`],
        ['sort', request.sort ?? 'date'],
        // Lifetime totals are not read. Collapsing "stats" too would drop
        // the events, users, first seen and last seen of each issue.
        ['collapse', 'lifetime'],
    ];
    const { rows, hasMoreRows } = await readRowsWithinCap({
        label: LABEL,
        requestedRows: Math.min(limit, request.limit ?? limit),
        maxRows: SENTRY_MAX_QUERY_ROWS,
        pageSize: PAGE_SIZE,
        maxPages: MAX_PAGES,
        fetchPage: async ({ limit: perPage, cursor }) => {
            const { data, nextCursor } = await get(
                calls,
                getSentryPaths(settings.organizationSlug).issues,
                [
                    ...params,
                    ['limit', String(perPage)],
                    ...(cursor ? ([['cursor', cursor]] as Params) : []),
                ],
                issuesResponseSchema,
            );
            return {
                rows: data.map((issue) =>
                    Object.fromEntries(
                        columns.map((column) => [
                            column,
                            readIssueColumn(issue, column),
                        ]),
                    ),
                ),
                nextCursor,
            };
        },
    });
    return {
        columns: columns.map(
            (name): LiveColumn => ({
                name,
                type: ISSUE_COLUMN_TYPES[name] ?? DimensionType.STRING,
            }),
        ),
        rows,
        hasMoreRows,
    };
};

const sessionsResponseSchema = z.object({
    intervals: z.array(z.string()).optional(),
    groups: z.array(
        z.object({
            by: z.record(
                z.string(),
                z.union([z.string(), z.number()]).nullable(),
            ),
            totals: z.record(z.string(), z.number().nullable()).optional(),
            series: z
                .record(z.string(), z.array(z.number().nullable()))
                .optional(),
        }),
    ),
});
type SessionsResponse = z.infer<typeof sessionsResponseSchema>;

const projectsResponseSchema = z.array(
    z.object({ id: z.union([z.string(), z.number()]), slug: z.string() }),
);

/** Sessions name a project by its ID; every other explore, by its slug. */
const fetchProjectSlugs = async (
    { organizationSlug }: SentrySettings,
    calls: LiveCalls,
): Promise<Map<string, string>> => {
    const slugs = new Map<string, string>();
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PROJECT_PAGES; page += 1) {
        // eslint-disable-next-line no-await-in-loop
        const { data, nextCursor } = await get(
            calls,
            getSentryPaths(organizationSlug).projects,
            [
                ['per_page', String(PAGE_SIZE)],
                ...(cursor ? ([['cursor', cursor]] as Params) : []),
            ],
            projectsResponseSchema,
        );
        data.forEach(({ id, slug }) => slugs.set(String(id), slug));
        cursor = nextCursor;
        if (!cursor) break;
    }
    return slugs;
};

const SESSION_HELPER = SESSION_FIELDS.sessions;

const isSessionMetric = (column: SessionColumn): column is SessionMetric =>
    Object.hasOwn(SESSION_FIELDS, column);
const isSessionGroup = (column: SessionColumn): column is SessionGroup =>
    Object.hasOwn(SESSION_GROUPS, column);

/** One row per group, or per group and day; days with no sessions have none. */
const toSessionRows = (
    { groups, intervals = [] }: SessionsResponse,
    columns: SessionColumn[],
    projectSlugs: Map<string, string>,
): Record<string, unknown>[] => {
    const byDay = columns.includes('date');
    const readGroup = (by: SessionsResponse['groups'][number]['by']) =>
        Object.fromEntries(
            columns.filter(isSessionGroup).map((column) => {
                const value = by[SESSION_GROUPS[column]];
                return [
                    column,
                    column === 'project' && value !== null
                        ? (projectSlugs.get(String(value)) ?? String(value))
                        : toText(value),
                ];
            }),
        );
    const readMetrics = (read: (field: string) => number | null | undefined) =>
        Object.fromEntries(
            columns
                .filter(isSessionMetric)
                .map((column) => [
                    column,
                    toNumber(read(SESSION_FIELDS[column])),
                ]),
        );
    return groups.flatMap(({ by, totals = {}, series = {} }) => {
        const group = readGroup(by);
        if (!byDay) {
            return (totals[SESSION_HELPER] ?? 0) > 0
                ? [{ ...group, ...readMetrics((field) => totals[field]) }]
                : [];
        }
        return intervals.flatMap((interval, index) =>
            (series[SESSION_HELPER]?.[index] ?? 0) > 0
                ? [
                      {
                          date: toDay(interval),
                          ...group,
                          ...readMetrics((field) => series[field]?.[index]),
                      },
                  ]
                : [],
        );
    });
};

const SESSION_COLUMN_TYPES: Partial<Record<SessionColumn, DimensionType>> = {
    date: DimensionType.DATE,
    sessions: DimensionType.NUMBER,
    users: DimensionType.NUMBER,
    crash_free_sessions: DimensionType.NUMBER,
    crash_free_users: DimensionType.NUMBER,
};

const DAY_MS = 86_400_000;

const runSessions = async ({
    settings,
    request,
    limit,
    calls,
}: {
    settings: SentrySettings;
    request: SentrySessionsRequest;
    limit: number;
    calls: LiveCalls;
}): Promise<LiveRunResult> => {
    const { columns } = request;
    const byDay = columns.includes('date');
    const days =
        Math.round(
            (Date.parse(`${request.end}T00:00:00Z`) -
                Date.parse(`${request.start}T00:00:00Z`)) /
                DAY_MS,
        ) + 1;
    // Each group returns a point per day, and Sentry caps the points
    const groupsPerPage = byDay
        ? Math.max(
              1,
              Math.min(
                  PAGE_SIZE,
                  Math.floor(SESSIONS_MAX_DATA_POINTS / (days + 1)),
              ),
          )
        : PAGE_SIZE;
    const fields = [
        ...new Set([
            ...columns
                .filter(isSessionMetric)
                .map((column) => SESSION_FIELDS[column]),
            // Tells days and groups with sessions from those with none
            SESSION_HELPER,
        ]),
    ];
    const params: Params = [
        ...fields.map((field): [string, string] => ['field', field]),
        ...columns
            .filter(isSessionGroup)
            .map((column): [string, string] => [
                'groupBy',
                SESSION_GROUPS[column],
            ]),
        ...toRangeParams(request),
        ['interval', '1d'],
        ['includeSeries', byDay ? '1' : '0'],
        ['includeTotals', byDay ? '0' : '1'],
        ...toFilterParams('sessions', settings, request.filters),
    ];
    const projectSlugs = columns.includes('project')
        ? await fetchProjectSlugs(settings, calls)
        : new Map<string, string>();
    const { rows, hasMoreRows } = await readRowsWithinCap({
        label: LABEL,
        requestedRows: limit,
        maxRows: SENTRY_MAX_QUERY_ROWS,
        pageSize: groupsPerPage,
        maxPages: MAX_PAGES,
        fetchPage: async ({ limit: perPage, cursor }) => {
            const { data, nextCursor } = await get(
                calls,
                getSentryPaths(settings.organizationSlug).sessions,
                [
                    ...params,
                    // A group is several rows when read by day
                    ['per_page', String(byDay ? groupsPerPage : perPage)],
                    ...(cursor ? ([['cursor', cursor]] as Params) : []),
                ],
                sessionsResponseSchema,
            );
            return {
                rows: toSessionRows(data, [...columns], projectSlugs),
                nextCursor,
            };
        },
    });
    return {
        columns: columns.map(
            (name): LiveColumn => ({
                name,
                type: SESSION_COLUMN_TYPES[name] ?? DimensionType.STRING,
            }),
        ),
        rows,
        hasMoreRows,
    };
};

/** Runs one Sentry request: grouped errors, an issue list, or release health. */
export const runSentryQuery = async ({
    settings,
    request,
    limit,
    calls,
}: LiveRunArgs<
    ApiConnectorType.SENTRY,
    SentryRequest
>): Promise<LiveRunResult> => {
    assertMaxRows(limit, SENTRY_MAX_QUERY_ROWS);
    switch (request.kind) {
        case 'errors':
            return runErrors({ settings, request, limit, calls });
        case 'issues':
            return runIssues({ settings, request, limit, calls });
        case 'sessions':
            return runSessions({ settings, request, limit, calls });
        default:
            throw new ParameterError('Unknown Sentry request kind');
    }
};
