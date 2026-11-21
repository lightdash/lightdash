import {
    ApiConnectorType,
    assertUnreachable,
    DimensionType,
    PYLON_ACCOUNTS_SEARCH_PATH,
    PYLON_CONTACTS_SEARCH_PATH,
    PYLON_ISSUES_SEARCH_PATH,
    PYLON_USERS_PATH,
} from '@lightdash/common';
import { z } from 'zod';
import { assertMaxRows } from '../../integration';
import { readRowsWithinCap, tooManyRowsError } from '../../query/rows';
import {
    type LiveCalls,
    type LiveColumn,
    type LiveRunArgs,
    type LiveRunResult,
} from '../../types';

const LABEL = 'Pylon';

/** Search reads at most 1,000 records a page. */
const PAGE_SIZE = 1_000;
const MAX_PAGES = 10;

/**
 * The most rows one query reads: one fewer than ten full pages, so reading
 * every page detects truncation.
 */
export const PYLON_MAX_QUERY_ROWS = PAGE_SIZE * MAX_PAGES - 1;

/** Account names are read 1,000 IDs a call, up to this many calls. */
const MAX_NAME_CALLS = MAX_PAGES;

/**
 * Pages, the account and assignee filter lookups, the teammate list, and
 * the account names of the records read.
 */
export const PYLON_CALLS_PER_QUERY = MAX_PAGES + 3 + MAX_NAME_CALLS;

const COLUMNS = {
    issues: [
        'number',
        'title',
        'link',
        'state',
        'type',
        'source',
        'account_name',
        'account_id',
        'assignee_email',
        'team_id',
        'tags',
        'created_at',
        'updated_at',
        'resolved_at',
        'first_response_minutes',
        'resolution_hours',
        'touches',
        'csat_score',
    ],
    accounts: [
        'id',
        'name',
        'domain',
        'type',
        'owner_email',
        'tags',
        'created_at',
        'last_customer_activity_at',
        'last_vendor_activity_at',
    ],
    contacts: [
        'id',
        'name',
        'email',
        'account_name',
        'account_id',
        'portal_role',
    ],
} as const;

type PylonKind = keyof typeof COLUMNS;

const SORT_FIELDS = {
    issues: ['created_at', 'updated_at', 'latest_message_time'],
    accounts: ['name', 'created_at', 'last_customer_activity_at'],
    contacts: [],
} as const;

const NUMBER_COLUMNS = new Set([
    'number',
    'first_response_minutes',
    'resolution_hours',
    'touches',
    'csat_score',
]);

const DATE_COLUMNS = new Set([
    'created_at',
    'updated_at',
    'resolved_at',
    'last_customer_activity_at',
    'last_vendor_activity_at',
]);

/** Filters resolved here before the search: Pylon filters these by ID only. */
const LOOKUP_FIELDS = {
    issues: ['account_name', 'assignee_email'],
    accounts: [],
    contacts: ['account_name'],
} as const;

const leafSchema = z
    .object({
        field: z.string().min(1),
        operator: z.enum([
            'equals',
            'not_equals',
            'in',
            'not_in',
            'contains',
            'does_not_contain',
            'string_contains',
            'string_does_not_contain',
            'is_set',
            'is_unset',
            'greater_than',
            'less_than',
            'time_range',
        ]),
        value: z.string().optional(),
        values: z.array(z.string()).optional(),
    })
    .strict();

const groupSchema = z
    .object({
        operator: z.enum(['and', 'or']),
        subfilters: z.array(leafSchema).min(1),
    })
    .strict();

/** A filter applied here on the rows read, where Pylon's search can't be trusted. */
const localFilterSchema = z.union([
    z
        .object({
            column: z.literal('first_response_minutes'),
            operator: z.enum(['greater_than', 'less_than']),
            value: z.number(),
        })
        .strict(),
    z
        .object({
            column: z.enum(['account_id', 'assignee_id']),
            operator: z.enum(['is_null', 'is_not_null']),
        })
        .strict(),
]);

export type PylonLocalFilter = z.infer<typeof localFilterSchema>;

export type PylonFilterLeaf = z.infer<typeof leafSchema>;
export type PylonFilter = PylonFilterLeaf | z.infer<typeof groupSchema>;

/** One Pylon request, as compile writes it and agents send it. */
export const pylonRequestSchema = z
    .object({
        kind: z.enum(['issues', 'accounts', 'contacts']),
        /** ANDed; Pylon's own search filters, plus the lookup fields. */
        filters: z.array(z.union([leafSchema, groupSchema])),
        columns: z.array(z.string()).min(1, 'Ask for at least one column'),
        /** ANDed; applied to the rows read, which are then read up to the cap. */
        localFilters: z.array(localFilterSchema).optional(),
        sort: z
            .object({
                field: z.string(),
                order: z.enum(['asc', 'desc']),
            })
            .strict()
            .optional(),
    })
    .strict()
    .superRefine((request, context) => {
        const allowed = (values: readonly string[], value: string) =>
            values.some((candidate) => candidate === value);
        request.columns.forEach((column, index) => {
            if (!allowed(COLUMNS[request.kind], column)) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['columns', index],
                    message: `"${column}" isn't a ${request.kind} column. Use one of: ${COLUMNS[request.kind].join(', ')}`,
                });
            }
        });
        if (request.localFilters?.length && request.kind !== 'issues') {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['localFilters'],
                message: 'Only issues take local filters',
            });
        }
        if (
            request.sort &&
            !allowed(SORT_FIELDS[request.kind], request.sort.field)
        ) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['sort', 'field'],
                message: `Pylon sorts ${request.kind} by ${SORT_FIELDS[request.kind].join(', ') || 'nothing'}`,
            });
        }
        const lookups: readonly string[] = LOOKUP_FIELDS[request.kind];
        request.filters.forEach((filter) => {
            // Lookups become ID filters before the search, so only at the top
            const leaves = 'subfilters' in filter ? filter.subfilters : [];
            const nested = leaves.find((leaf) => allowed(lookups, leaf.field));
            if (nested) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['filters'],
                    message: `${nested.field} can't be inside an "and" or "or" group`,
                });
            }
            if (
                !('subfilters' in filter) &&
                allowed(lookups, filter.field) &&
                filter.operator !== 'in' &&
                filter.operator !== 'not_in'
            ) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['filters'],
                    message: `${filter.field} takes "in" or "not_in"`,
                });
            }
        });
    });

export type PylonRequest = z.infer<typeof pylonRequestSchema>;

const refSchema = z.object({ id: z.string() }).nullable().optional();

const issueSchema = z.object({
    number: z.number(),
    title: z.string(),
    link: z.string(),
    state: z.string(),
    type: z.string(),
    source: z.string(),
    account: refSchema,
    assignee: refSchema,
    team: refSchema,
    tags: z.array(z.string()).nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
    resolution_time: z.string().nullable().optional(),
    resolution_seconds: z.number().optional(),
    first_response_time: z.string().nullable().optional(),
    first_response_seconds: z.number().optional(),
    number_of_touches: z.number(),
    csat_responses: z.array(z.object({ score: z.number() })).optional(),
});
type PylonIssue = z.infer<typeof issueSchema>;

const accountSchema = z.object({
    id: z.string(),
    name: z.string(),
    domain: z.string().nullable().optional(),
    primary_domain: z.string().nullable().optional(),
    type: z.string(),
    owner: refSchema,
    tags: z.array(z.string()).nullable().optional(),
    created_at: z.string(),
    latest_customer_activity_time: z.string().optional(),
    latest_vendor_activity_time: z.string().optional(),
});
type PylonAccount = z.infer<typeof accountSchema>;

const contactSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().optional(),
    account: refSchema,
    portal_role: z.string().optional(),
});
type PylonContact = z.infer<typeof contactSchema>;

const pageSchema = <T extends z.ZodTypeAny>(item: T) =>
    z.object({
        data: z.array(item),
        pagination: z
            .object({ cursor: z.string(), has_next_page: z.boolean() })
            .optional(),
    });

const usersSchema = z.object({
    data: z.array(
        z.object({
            id: z.string(),
            email: z.string(),
            emails: z.array(z.string()).nullable().optional(),
        }),
    ),
});

/** A UTC day from a timestamp; Pylon reports empty strings for none. */
const toDay = (timestamp: string | null | undefined) =>
    timestamp ? timestamp.slice(0, 10) : null;

const round = (value: number, digits: number) =>
    Math.round(value * 10 ** digits) / 10 ** digits;

const joinTags = (tags: string[] | null | undefined) =>
    tags && tags.length > 0 ? tags.join(', ') : null;

/** What issues and contacts hold only by ID, read for the columns asked for. */
type Names = {
    accounts: Map<string, string>;
    users: Map<string, string>;
};

const nameOf = (
    names: Map<string, string>,
    ref: { id: string } | null | undefined,
) => (ref ? (names.get(ref.id) ?? null) : null);

const readIssueColumn = (
    issue: PylonIssue,
    column: string,
    names: Names,
): unknown => {
    switch (column) {
        case 'number':
            return issue.number;
        case 'title':
            return issue.title;
        case 'link':
            return issue.link;
        case 'state':
            return issue.state;
        case 'type':
            return issue.type;
        case 'source':
            return issue.source;
        case 'account_name':
            return nameOf(names.accounts, issue.account);
        case 'account_id':
            return issue.account?.id ?? null;
        case 'assignee_email':
            return nameOf(names.users, issue.assignee);
        case 'team_id':
            return issue.team?.id ?? null;
        case 'tags':
            return joinTags(issue.tags);
        case 'created_at':
            return toDay(issue.created_at);
        case 'updated_at':
            return toDay(issue.updated_at);
        case 'resolved_at':
            return toDay(issue.resolution_time);
        case 'first_response_minutes':
            return issue.first_response_time &&
                issue.first_response_seconds !== undefined
                ? round(issue.first_response_seconds / 60, 2)
                : null;
        case 'resolution_hours':
            return issue.resolution_time &&
                issue.resolution_seconds !== undefined
                ? round(issue.resolution_seconds / 3600, 2)
                : null;
        case 'touches':
            return issue.number_of_touches;
        case 'csat_score':
            return issue.csat_responses?.[0]?.score ?? null;
        default:
            return null;
    }
};

const readAccountColumn = (
    account: PylonAccount,
    column: string,
    names: Names,
): unknown => {
    switch (column) {
        case 'id':
            return account.id;
        case 'name':
            return account.name;
        case 'domain':
            return account.primary_domain || account.domain || null;
        case 'type':
            return account.type;
        case 'owner_email':
            return nameOf(names.users, account.owner);
        case 'tags':
            return joinTags(account.tags);
        case 'created_at':
            return toDay(account.created_at);
        case 'last_customer_activity_at':
            return toDay(account.latest_customer_activity_time);
        case 'last_vendor_activity_at':
            return toDay(account.latest_vendor_activity_time);
        default:
            return null;
    }
};

const readContactColumn = (
    contact: PylonContact,
    column: string,
    names: Names,
): unknown => {
    switch (column) {
        case 'id':
            return contact.id;
        case 'name':
            return contact.name;
        case 'email':
            return contact.email || null;
        case 'account_name':
            return nameOf(names.accounts, contact.account);
        case 'account_id':
            return contact.account?.id ?? null;
        case 'portal_role':
            return contact.portal_role || null;
        default:
            return null;
    }
};

const KINDS = {
    issues: { path: PYLON_ISSUES_SEARCH_PATH, schema: issueSchema },
    accounts: { path: PYLON_ACCOUNTS_SEARCH_PATH, schema: accountSchema },
    contacts: { path: PYLON_CONTACTS_SEARCH_PATH, schema: contactSchema },
} as const;

type PylonRecord = PylonIssue | PylonAccount | PylonContact;

const readColumn = (
    kind: PylonKind,
    record: PylonRecord,
    column: string,
    names: Names,
) => {
    switch (kind) {
        case 'issues':
            return readIssueColumn(record as PylonIssue, column, names);
        case 'accounts':
            return readAccountColumn(record as PylonAccount, column, names);
        default:
            return readContactColumn(record as PylonContact, column, names);
    }
};

const toPylonFilter = (filters: PylonFilter[]) => {
    if (filters.length === 0) {
        return {};
    }
    return {
        filter:
            filters.length === 1
                ? filters[0]
                : { operator: 'and', subfilters: filters },
    };
};

const searchPage = async ({
    calls,
    kind,
    filters,
    sort,
    limit,
    cursor,
}: {
    calls: LiveCalls;
    kind: PylonKind;
    filters: PylonFilter[];
    sort?: PylonRequest['sort'];
    limit: number;
    cursor: string | undefined;
}) => {
    const { path, schema } = KINDS[kind];
    const response = await calls.fetch(
        {
            method: 'POST',
            path,
            body: {
                ...toPylonFilter(filters),
                limit,
                ...(sort ? { sort: [sort] } : {}),
                ...(cursor ? { cursor } : {}),
            },
        },
        pageSchema(schema as z.ZodType<PylonRecord>),
    );
    const { pagination } = response;
    return {
        records: response.data,
        nextCursor:
            pagination?.has_next_page && pagination.cursor
                ? pagination.cursor
                : undefined,
    };
};

const chunk = <T>(values: T[], size: number): T[][] =>
    Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
        values.slice(index * size, (index + 1) * size),
    );

/** Account IDs by name; names match exactly, as Pylon shows them. */
const findAccountIds = async (calls: LiveCalls, names: string[]) => {
    const { records } = await searchPage({
        calls,
        kind: 'accounts',
        filters: [{ field: 'name', operator: 'in', values: names }],
        limit: PAGE_SIZE,
        cursor: undefined,
    });
    return records.map((account) => (account as PylonAccount).id);
};

const readUsers = async (calls: LiveCalls) => {
    const { data } = await calls.fetch(
        { method: 'GET', path: PYLON_USERS_PATH, body: undefined },
        usersSchema,
    );
    return data;
};

/** Teammate IDs by email, including their secondary emails. */
const findUserIds = async (calls: LiveCalls, emails: string[]) => {
    const wanted = new Set(emails.map((email) => email.trim().toLowerCase()));
    const users = await readUsers(calls);
    return users
        .filter((user) =>
            [user.email, ...(user.emails ?? [])].some((email) =>
                wanted.has(email.toLowerCase()),
            ),
        )
        .map((user) => user.id);
};

/**
 * Turns the lookup filters into Pylon's ID filters. Null when an "in"
 * lookup matched nothing, so nothing can match the search.
 */
const resolveLookups = async (
    filters: PylonFilter[],
    calls: LiveCalls,
): Promise<PylonFilter[] | null> => {
    const resolved: PylonFilter[] = [];
    for (const filter of filters) {
        const isLookup =
            !('subfilters' in filter) &&
            (filter.field === 'account_name' ||
                filter.field === 'assignee_email');
        if (!isLookup) {
            resolved.push(filter);
        } else {
            const values = filter.values ?? [];
            const ids =
                filter.field === 'account_name'
                    ? // eslint-disable-next-line no-await-in-loop
                      await findAccountIds(calls, values)
                    : // eslint-disable-next-line no-await-in-loop
                      await findUserIds(calls, values);
            if (ids.length === 0 && filter.operator === 'in') {
                return null;
            }
            if (ids.length > 0) {
                resolved.push({
                    field:
                        filter.field === 'account_name'
                            ? 'account_id'
                            : 'assignee_id',
                    operator: filter.operator,
                    values: ids,
                });
            }
        }
    }
    return resolved;
};

/** Account names by ID, 1,000 IDs a call. */
const readAccountNames = async (
    calls: LiveCalls,
    ids: string[],
): Promise<Map<string, string>> => {
    const values = new Map<string, string>();
    const batches = chunk([...new Set(ids)], PAGE_SIZE);
    if (batches.length > MAX_NAME_CALLS) {
        throw tooManyRowsError({ label: LABEL, maxRows: PYLON_MAX_QUERY_ROWS });
    }
    for (const batch of batches) {
        // eslint-disable-next-line no-await-in-loop
        const { records } = await searchPage({
            calls,
            kind: 'accounts',
            filters: [{ field: 'account_id', operator: 'in', values: batch }],
            limit: PAGE_SIZE,
            cursor: undefined,
        });
        records.forEach((record) => {
            const { id, name } = record as PylonAccount;
            values.set(id, name);
        });
    }
    return values;
};

const accountIdsOf = (records: PylonRecord[]) =>
    records.flatMap((record) => {
        const { account } = record as Partial<
            Record<'account', { id: string } | null>
        >;
        return account ? [account.id] : [];
    });

/** Reads the names behind the IDs of the records, for the columns asked for. */
const readNames = async (
    calls: LiveCalls,
    records: PylonRecord[],
    columns: string[],
): Promise<Names> => ({
    accounts: columns.includes('account_name')
        ? await readAccountNames(calls, accountIdsOf(records))
        : new Map(),
    users: columns.some(
        (column) => column === 'assignee_email' || column === 'owner_email',
    )
        ? new Map((await readUsers(calls)).map(({ id, email }) => [id, email]))
        : new Map(),
});

const toColumns = (names: string[]): LiveColumn[] =>
    names.map((name) => {
        if (DATE_COLUMNS.has(name)) {
            return { name, type: DimensionType.DATE };
        }
        return {
            name,
            type: NUMBER_COLUMNS.has(name)
                ? DimensionType.NUMBER
                : DimensionType.STRING,
        };
    });

/** Whether an issue passes a local filter; a missing number never matches, as in SQL. */
const matchesLocalFilter = (issue: PylonIssue, filter: PylonLocalFilter) => {
    switch (filter.column) {
        case 'first_response_minutes': {
            const value = readIssueColumn(issue, filter.column, {
                accounts: new Map(),
                users: new Map(),
            });
            if (typeof value !== 'number') return false;
            return filter.operator === 'greater_than'
                ? value > filter.value
                : value < filter.value;
        }
        case 'account_id':
        case 'assignee_id': {
            const ref =
                filter.column === 'account_id' ? issue.account : issue.assignee;
            const isNull = !ref?.id;
            return filter.operator === 'is_null' ? isNull : !isNull;
        }
        default:
            return assertUnreachable(filter, 'Unknown Pylon local filter');
    }
};

/** Runs one Pylon request: one search, paged by cursor. */
export const runPylonQuery = async ({
    request,
    limit,
    calls,
}: LiveRunArgs<
    ApiConnectorType.PYLON,
    PylonRequest
>): Promise<LiveRunResult> => {
    assertMaxRows(limit, PYLON_MAX_QUERY_ROWS);
    const { kind, columns, sort, localFilters = [] } = request;
    const resultColumns = toColumns(columns);
    const filters = await resolveLookups(request.filters, calls);
    if (!filters) {
        return { columns: resultColumns, rows: [], hasMoreRows: false };
    }
    // Rows filtered here are read up to the cap, so the limit counts kept rows
    const rowsToRead = localFilters.length > 0 ? PYLON_MAX_QUERY_ROWS : limit;
    const { rows: readRecords, hasMoreRows: hasMoreRead } =
        await readRowsWithinCap({
            label: LABEL,
            requestedRows: rowsToRead,
            maxRows: PYLON_MAX_QUERY_ROWS,
            pageSize: Math.min(PAGE_SIZE, rowsToRead + 1),
            maxPages: MAX_PAGES,
            fetchPage: async ({ limit: pageLimit, cursor }) => {
                const page = await searchPage({
                    calls,
                    kind,
                    filters,
                    sort,
                    limit: pageLimit,
                    cursor,
                });
                return { rows: page.records, nextCursor: page.nextCursor };
            },
        });
    // Matches past the rows read would be missed, so the filter needs them all
    if (localFilters.length > 0 && hasMoreRead) {
        throw tooManyRowsError({ label: LABEL, maxRows: PYLON_MAX_QUERY_ROWS });
    }
    const keptRecords = (readRecords as PylonRecord[]).filter((record) =>
        localFilters.every((filter) =>
            matchesLocalFilter(record as PylonIssue, filter),
        ),
    );
    const typedRecords = keptRecords.slice(0, limit);
    const hasMoreRows =
        localFilters.length > 0 ? keptRecords.length > limit : hasMoreRead;
    const names = await readNames(calls, typedRecords, columns);
    return {
        columns: resultColumns,
        rows: typedRecords.map((record) =>
            Object.fromEntries(
                columns.map((column) => [
                    column,
                    readColumn(kind, record, column, names),
                ]),
            ),
        ),
        hasMoreRows,
    };
};
