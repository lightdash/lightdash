import {
    DimensionType,
    getSentryPaths,
    ParameterError,
    SENTRY_MAX_PROJECTS,
    UnexpectedServerError,
    type ApiConnectorType,
} from '@lightdash/common';
import { z } from 'zod';
import {
    assertMaxRows,
    readRowsWithinCap,
    refuseLiveQuery,
    tooManyRowsError,
    type LiveColumn,
    type LiveRunArgs,
    type LiveRunResult,
    type LiveRuntime,
} from '../../sdk';
import { SENTRY_RETENTION_DAYS, toRawQuery, type Params } from './api';

const LABEL = 'Sentry';

/** Events and issues return 100 rows a page; sessions, 100 groups. */
export const SENTRY_PAGE_SIZE = 100;
const MAX_PAGES = 10;

/**
 * The most rows one query can return: one fewer than ten pages hold, so
 * reading every page detects truncation.
 */
export const SENTRY_MAX_QUERY_ROWS = SENTRY_PAGE_SIZE * MAX_PAGES - 1;

/** Sessions by project are read one project a call, each over its pages. */
export const SENTRY_CALLS_PER_QUERY = MAX_PAGES + SENTRY_MAX_PROJECTS;

/** The sessions API returns at most this many data points in one call. */
const SESSIONS_MAX_DATA_POINTS = 10_000;

/**
 * Groups asked for when sessions are read by status. Sentry adds a group
 * for each status after it limits the groups, and takes one off when their
 * count is one more than asked. This is far from the count of statuses.
 */
const SESSION_STATUS_PAGE_SIZE = 10;

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
/** The groupings Session status can't be read with; see SESSION_STATUS_PAGE_SIZE. */
const SESSION_STATUS_ALONE: SessionColumn[] = [
    'project',
    'release',
    'environment',
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
            {
                message:
                    'A project filter or an environment filter takes "is" only.',
            },
        );

const dayRangeSchema = z
    .object({ start: day, end: day })
    .strict()
    .refine(({ start, end }) => start <= end, {
        message: 'The start must be on or before the end.',
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
        { message: 'The date range starts after it ends.' },
    )
    .refine(
        (request) =>
            request.kind !== 'errors' ||
            !request.sort ||
            request.columns.includes(request.sort.column),
        { message: 'The sort column must be one of the columns.' },
    )
    .refine(
        (request) =>
            request.kind !== 'sessions' ||
            !request.columns.includes('session_status') ||
            !request.columns.some((column) => SESSION_RATES.includes(column)),
        {
            message:
                'A crash-free rate has no value for one session status. Read sessions by session_status instead.',
        },
    )
    .refine(
        (request) =>
            request.kind !== 'sessions' ||
            !request.columns.includes('session_status') ||
            !request.columns.some((column) =>
                SESSION_STATUS_ALONE.includes(column),
            ),
        {
            message:
                'Sentry does not say when it cuts short a list by session_status and by project, release or environment. Filter them instead.',
        },
    );

export type SentryRequest = z.infer<typeof sentryRequestSchema>;
type SentryErrorsRequest = z.infer<typeof errorsRequestSchema>;
type SentryIssuesRequest = z.infer<typeof issuesRequestSchema>;
type SentrySessionsRequest = z.infer<typeof sessionsRequestSchema>;
export type SentryFilter = NonNullable<SentryErrorsRequest['filters']>[number];

/**
 * The cursor of the next page, when the Link header says it has results.
 * Sentry writes it in the link's target and may repeat it as an attribute.
 * The target is only read, never called.
 */
export const getNextCursor = (link: string | undefined): string | undefined => {
    const next = [...(link ?? '').matchAll(/<([^<>]*)>([^<]*)/g)].find(
        ([, , attributes]) =>
            /rel="next"/.test(attributes) && /results="true"/.test(attributes),
    );
    if (!next) return undefined;
    const [, target, attributes] = next;
    const attribute = attributes.match(/cursor="([^"]+)"/)?.[1];
    if (attribute) return attribute;
    try {
        return (
            new URL(target, 'https://sentry.invalid').searchParams.get(
                'cursor',
            ) ?? undefined
        );
    } catch {
        return undefined;
    }
};

const get = async <T>(
    runtime: LiveRuntime,
    path: string,
    params: Params,
    schema: z.ZodType<T>,
): Promise<{ data: T; nextCursor: string | undefined }> => {
    const response = await runtime.send({
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

/** Refuses a day the calendar doesn't have, such as 2026-02-30. */
const assertRealDays = (...values: (string | undefined)[]) => {
    values.forEach((value) => {
        if (value === undefined) return;
        const date = new Date(`${value}T00:00:00Z`);
        if (
            Number.isNaN(date.getTime()) ||
            date.toISOString().slice(0, 10) !== value
        ) {
            throw refuseLiveQuery(
                'live_source.refused.date_range',
                `"${value}" isn't a day of the calendar. Use a real date, as YYYY-MM-DD.`,
            );
        }
    });
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
    throw new ParameterError('An Unhandled filter takes true or false.');
};

/** The three statuses of an issue, by the name Sentry's search gives each. */
const ISSUE_STATUS_TERMS = {
    unresolved: 'unresolved',
    resolved: 'resolved',
    ignored: 'archived',
} as const;
type IssueStatus = keyof typeof ISSUE_STATUS_TERMS;
const ISSUE_STATUSES = Object.keys(ISSUE_STATUS_TERMS) as IssueStatus[];

const toIssueStatus = (value: string): IssueStatus => {
    // Sentry's own screens name an ignored issue "archived"
    const status = value === 'archived' ? 'ignored' : value;
    if (!ISSUE_STATUSES.some((known) => known === status)) {
        throw new ParameterError(
            'Status must be one of: unresolved, resolved, ignored.',
        );
    }
    return status as IssueStatus;
};

/**
 * A status filter as search terms. Sentry's issue search has no "or", and
 * an issue has one of three statuses, so two of them are "not the third".
 */
const toStatusTerms = (values: string[], isNegative: boolean): string[] => {
    const named = new Set(values.map(toIssueStatus));
    const kept = ISSUE_STATUSES.filter(
        (status) => named.has(status) !== isNegative,
    );
    if (kept.length === 0) {
        throw new ParameterError(
            'The status filter leaves no issue to read. Remove a status from it.',
        );
    }
    if (kept.length === ISSUE_STATUSES.length) return [];
    return kept.length === 1
        ? [`is:${ISSUE_STATUS_TERMS[kept[0]]}`]
        : ISSUE_STATUSES.filter((status) => !kept.includes(status)).map(
              (status) => `!is:${ISSUE_STATUS_TERMS[status]}`,
          );
};

/**
 * The search terms of one filter, ANDed; several values match any of them.
 * None when the filter keeps every row.
 */
const toSearchTerms = (
    kind: keyof typeof SEARCH_KEYS,
    key: string,
    { operator, values }: SentryFilter,
): string[] => {
    const isNegative = operator === 'is_not' || operator === 'not_contains';
    const not = isNegative ? '!' : '';
    if (operator === 'contains' || operator === 'not_contains') {
        const terms = values.map(
            (value) => `${not}${key}:"*${quote(value).slice(1, -1)}*"`,
        );
        // None of the parts when dropped: each is its own term
        if (isNegative || terms.length === 1) return terms;
        if (kind === 'issues') {
            throw new ParameterError(
                'Sentry issue search has no "or", so a Title filter on Issues takes one value. Use one value in each filter, or use the Errors explore.',
            );
        }
        return [`(${terms.join(' OR ')})`];
    }
    if (key === 'error.unhandled') {
        const named = new Set(values.map(toBoolean));
        // Both values keep every error when kept, and none when dropped
        if (named.size > 1) {
            if (isNegative) {
                throw new ParameterError(
                    'The Unhandled filter leaves no row to read. Use one value.',
                );
            }
            return [];
        }
        return [`${not}${key}:${[...named][0]}`];
    }
    if (key === 'is') {
        return toStatusTerms(values, isNegative);
    }
    return [
        values.length === 1
            ? `${not}${key}:${quote(values[0])}`
            : `${not}${key}:[${values.map(quote).join(',')}]`,
    ];
};

/**
 * The values every filter on `field` keeps, or null with no such filter.
 * Filters are ANDed, so a value must be in each of them.
 */
const getKeptValues = (
    filters: SentryFilter[],
    field: (typeof SCOPE_FILTERS)[number],
): string[] | null => {
    const named = filters
        .filter((filter) => filter.field === field)
        .map(({ values }) => values.map((value) => value.trim()));
    if (named.length === 0) return null;
    return [...new Set(named[0])].filter((value) =>
        named.every((values) => values.includes(value)),
    );
};

/**
 * The projects a request reads: the ones it filters by, or every project of
 * the source. Sentry reads all the token can when no project is named, so
 * every call names its projects, and none outside the source's.
 */
const getProjects = (
    { projectSlugs }: SentrySettings,
    filters: SentryFilter[] = [],
): string[] => {
    const outside = filters
        .filter(({ field }) => field === 'project')
        .flatMap(({ values }) => values.map((value) => value.trim()))
        .filter((slug) => !projectSlugs.includes(slug));
    if (outside.length > 0) {
        throw new ParameterError(
            `This Sentry source reads only these projects: ${projectSlugs.join(', ')}. It can't read ${[...new Set(outside)].join(', ')}.`,
        );
    }
    const kept = getKeptValues(filters, 'project');
    if (kept === null) return projectSlugs;
    if (kept.length === 0) {
        throw new ParameterError(
            'The project filters leave no project to read. Filter Project once.',
        );
    }
    return projectSlugs.filter((slug) => kept.includes(slug));
};

/**
 * The environments a request reads, none meaning all of them. Sentry reads
 * every environment when none is named, so filters that share none are
 * refused and not sent as no filter.
 */
const getEnvironments = (filters: SentryFilter[] = []): string[] => {
    const kept = getKeptValues(filters, 'environment');
    if (kept === null) return [];
    if (kept.length === 0) {
        throw new ParameterError(
            'The environment filters leave no environment to read. Filter Environment once.',
        );
    }
    return kept;
};

/** Projects and environments as parameters, everything else as one search. */
const toFilterParams = (
    kind: keyof typeof SEARCH_KEYS,
    projects: string[],
    filters: SentryFilter[] = [],
    extraTerms: string[] = [],
): Params => {
    const keys: Record<string, string> = SEARCH_KEYS[kind];
    const terms = [
        ...filters
            .filter(({ field }) => Object.hasOwn(keys, field))
            .flatMap((filter) =>
                toSearchTerms(kind, keys[filter.field], filter),
            ),
        ...extraTerms,
    ];
    return [
        ...projects.map((slug): [string, string] => ['project', slug]),
        ...getEnvironments(filters).map((environment): [string, string] => [
            'environment',
            environment,
        ]),
        // Sent even when empty: issues default to unresolved ones without it
        ['query', terms.join(' ')],
    ];
};

/**
 * Reads rows over Sentry's pages. A query that asks for every row one query
 * can read is refused when Sentry has more, and not answered from part of
 * them. A smaller limit is a top of the list, and says that more exist.
 */
const readSentryRows = async ({
    requestedRows,
    pageSize,
    fetchPage,
}: Pick<
    Parameters<typeof readRowsWithinCap>[0],
    'requestedRows' | 'pageSize' | 'fetchPage'
>) => {
    const result = await readRowsWithinCap({
        label: LABEL,
        requestedRows,
        maxRows: SENTRY_MAX_QUERY_ROWS,
        pageSize,
        maxPages: MAX_PAGES,
        fetchPage,
    });
    if (result.hasMoreRows && requestedRows >= SENTRY_MAX_QUERY_ROWS) {
        throw tooManyRowsError({
            label: LABEL,
            maxRows: SENTRY_MAX_QUERY_ROWS,
        });
    }
    return result;
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
    runtime,
}: {
    settings: SentrySettings;
    request: SentryErrorsRequest;
    limit: number;
    runtime: LiveRuntime;
}): Promise<LiveRunResult> => {
    const { columns } = request;
    // Sentry refuses to count a field it also groups by. Grouped by issue,
    // each row is one issue, so Issues is 1 and is not asked for.
    const isOneIssueARow =
        columns.includes('issue') && columns.includes('issues');
    const isAskedFor = (column: ErrorColumn) =>
        !(isOneIssueARow && column === 'issues');
    const askedFor = columns.filter(isAskedFor);
    // Every row has the same Issues then, so it orders nothing
    const sort =
        request.sort && isAskedFor(request.sort.column)
            ? request.sort
            : undefined;
    const fields = [
        ...new Set([
            ...askedFor.map((column) => ERROR_FIELDS[column]),
            // Sentry groups rows only when a function is selected; without
            // one it lists events one by one
            ...(askedFor.some((column) => ERROR_METRICS.includes(column))
                ? []
                : [ERROR_FIELDS.events]),
            ...(columns.includes('issue') ? [ISSUE_ORDER_FIELD] : []),
        ]),
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
        ...toFilterParams(
            'errors',
            getProjects(settings, request.filters),
            request.filters,
        ),
        ...sorts.map((field): [string, string] => ['sort', field]),
    ];
    const { rows, hasMoreRows } = await readSentryRows({
        requestedRows: Math.min(limit, request.limit ?? limit),
        pageSize: SENTRY_PAGE_SIZE,
        fetchPage: async ({ limit: perPage, cursor }) => {
            const { data, nextCursor } = await get(
                runtime,
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
                            isAskedFor(column)
                                ? readErrorColumn(row, column)
                                : 1,
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
    runtime,
}: {
    settings: SentrySettings;
    request: SentryIssuesRequest;
    limit: number;
    runtime: LiveRuntime;
}): Promise<LiveRunResult> => {
    const { columns } = request;
    const params: Params = [
        ...toFilterParams(
            'issues',
            getProjects(settings, request.filters),
            request.filters,
            [
                ...toSeenTerms('firstSeen', request.firstSeen),
                ...toSeenTerms('lastSeen', request.lastSeen),
            ],
        ),
        ['statsPeriod', `${SENTRY_RETENTION_DAYS}d`],
        ['sort', request.sort ?? 'date'],
        // Lifetime totals are not read. Collapsing "stats" too would drop
        // the events, users, first seen and last seen of each issue.
        ['collapse', 'lifetime'],
    ];
    const { rows, hasMoreRows } = await readSentryRows({
        requestedRows: Math.min(limit, request.limit ?? limit),
        pageSize: SENTRY_PAGE_SIZE,
        fetchPage: async ({ limit: perPage, cursor }) => {
            const { data, nextCursor } = await get(
                runtime,
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

const SESSION_HELPER = SESSION_FIELDS.sessions;

const isSessionMetric = (column: SessionColumn): column is SessionMetric =>
    Object.hasOwn(SESSION_FIELDS, column);
const isSessionGroup = (column: SessionColumn): column is SessionGroup =>
    Object.hasOwn(SESSION_GROUPS, column);

/**
 * One row per group, or per group and day; days with no sessions have none.
 * Project is not read from the groups, where Sentry writes it as a number:
 * the caller reads one named project a call.
 */
const toSessionRows = (
    { groups, intervals = [] }: SessionsResponse,
    columns: SessionColumn[],
    project: string | null,
): Record<string, unknown>[] => {
    const byDay = columns.includes('date');
    const readGroup = (by: SessionsResponse['groups'][number]['by']) =>
        Object.fromEntries(
            columns
                .filter(isSessionGroup)
                .map((column) => [
                    column,
                    column === 'project'
                        ? project
                        : toText(by[SESSION_GROUPS[column]]),
                ]),
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

/**
 * The groups one call may ask for over a range of days. Sentry counts a
 * point for each group and day, and reads one group more than asked to find
 * the next page, so that group is in the budget.
 */
const getSessionGroupsPerPage = (days: number) => {
    const groups = Math.min(
        SENTRY_PAGE_SIZE,
        Math.floor(SESSIONS_MAX_DATA_POINTS / (days + 1)) - 1,
    );
    if (groups < 1) {
        throw refuseLiveQuery(
            'live_source.refused.date_range',
            `Sentry can't read sessions over ${days.toLocaleString('en-US')} days in one query. Narrow the date range.`,
        );
    }
    return groups;
};

const runSessions = async ({
    settings,
    request,
    limit,
    runtime,
}: {
    settings: SentrySettings;
    request: SentrySessionsRequest;
    limit: number;
    runtime: LiveRuntime;
}): Promise<LiveRunResult> => {
    const { columns } = request;
    const byDay = columns.includes('date');
    const byStatus = columns.includes('session_status');
    const days =
        Math.round(
            (Date.parse(`${request.end}T00:00:00Z`) -
                Date.parse(`${request.start}T00:00:00Z`)) /
                DAY_MS,
        ) + 1;
    const groupsPerPage = byStatus
        ? Math.min(SESSION_STATUS_PAGE_SIZE, getSessionGroupsPerPage(days))
        : getSessionGroupsPerPage(days);
    const fields = [
        ...new Set([
            ...columns
                .filter(isSessionMetric)
                .map((column) => SESSION_FIELDS[column]),
            // Tells days and groups with sessions from those with none
            SESSION_HELPER,
        ]),
    ];
    const projects = getProjects(settings, request.filters);
    // Grouped by project, Sentry names each by a number. One named project
    // a call needs no list of the organization's projects to read them.
    const reads = columns.includes('project')
        ? projects.map((project) => ({ projects: [project], project }))
        : [{ projects, project: null }];
    const toParams = (readProjects: string[]): Params => [
        ...fields.map((field): [string, string] => ['field', field]),
        ...columns
            .filter(
                (column): column is SessionGroup =>
                    isSessionGroup(column) && column !== 'project',
            )
            .map((column): [string, string] => [
                'groupBy',
                SESSION_GROUPS[column],
            ]),
        ...toRangeParams(request),
        ['interval', '1d'],
        ['includeSeries', byDay ? '1' : '0'],
        ['includeTotals', byDay ? '0' : '1'],
        ...toFilterParams('sessions', readProjects, request.filters),
    ];
    const rows: Record<string, unknown>[] = [];
    let hasMoreRows = false;
    for (let index = 0; index < reads.length; index += 1) {
        const read = reads[index];
        const params = toParams(read.projects);
        // With every row asked for already read, one more row of the next
        // project says the result has more
        const wanted = Math.max(1, limit - rows.length);
        // eslint-disable-next-line no-await-in-loop
        const page = await readSentryRows({
            requestedRows: wanted,
            pageSize: groupsPerPage,
            fetchPage: async ({ limit: perPage, cursor }) => {
                const { data, nextCursor } = await get(
                    runtime,
                    getSentryPaths(settings.organizationSlug).sessions,
                    [
                        ...params,
                        // A group is several rows when read by day or status
                        [
                            'per_page',
                            String(
                                byDay || byStatus
                                    ? groupsPerPage
                                    : Math.min(perPage, groupsPerPage),
                            ),
                        ],
                        ...(cursor ? ([['cursor', cursor]] as Params) : []),
                    ],
                    sessionsResponseSchema,
                );
                if (byStatus && nextCursor !== undefined) {
                    // See SESSION_STATUS_PAGE_SIZE: Sentry took a status off
                    throw refuseLiveQuery(
                        'live_source.refused.row_limit',
                        'Sentry cut this list of sessions by status short, so its result would be incomplete. Remove Session status, or select fewer fields.',
                    );
                }
                return {
                    rows: toSessionRows(data, [...columns], read.project),
                    nextCursor,
                };
            },
        });
        if (rows.length >= limit) {
            hasMoreRows = page.rows.length > 0;
            if (hasMoreRows) break;
        } else {
            rows.push(...page.rows);
            if (page.hasMoreRows) {
                hasMoreRows = true;
                break;
            }
        }
    }
    if (hasMoreRows && limit >= SENTRY_MAX_QUERY_ROWS) {
        throw tooManyRowsError({
            label: LABEL,
            maxRows: SENTRY_MAX_QUERY_ROWS,
        });
    }
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
    runtime,
}: LiveRunArgs<
    ApiConnectorType.SENTRY,
    SentryRequest
>): Promise<LiveRunResult> => {
    assertMaxRows(limit, SENTRY_MAX_QUERY_ROWS);
    if (request.kind === 'issues') {
        assertRealDays(
            request.firstSeen?.start,
            request.firstSeen?.end,
            request.lastSeen?.start,
            request.lastSeen?.end,
        );
    } else {
        assertRealDays(request.start, request.end);
    }
    switch (request.kind) {
        case 'errors':
            return runErrors({ settings, request, limit, runtime });
        case 'issues':
            return runIssues({ settings, request, limit, runtime });
        case 'sessions':
            return runSessions({ settings, request, limit, runtime });
        default:
            throw new ParameterError('The Sentry request kind is unknown.');
    }
};
