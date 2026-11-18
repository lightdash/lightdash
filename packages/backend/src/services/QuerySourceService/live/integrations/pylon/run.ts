import {
    ApiConnectorType,
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
 * every page detects truncation. Counts are worked out from these rows.
 */
export const PYLON_MAX_QUERY_ROWS = PAGE_SIZE * MAX_PAGES - 1;

/** Account names and requester emails are read 1,000 IDs a call, up to this many calls each. */
const MAX_NAME_CALLS = MAX_PAGES;

/**
 * Pages, the account and assignee filter lookups, the teammate list, and
 * the account names and requester emails of the records read.
 */
export const PYLON_CALLS_PER_QUERY = MAX_PAGES + 3 + 2 * MAX_NAME_CALLS;

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
        'requester_email',
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

const METRICS = {
    issues: [
        'count',
        'average_first_response_minutes',
        'average_resolution_hours',
    ],
    accounts: ['count'],
    contacts: ['count'],
} as const;

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

export type PylonFilterLeaf = z.infer<typeof leafSchema>;
export type PylonFilter = PylonFilterLeaf | z.infer<typeof groupSchema>;

/** One Pylon request, as compile writes it and agents send it. */
export const pylonRequestSchema = z
    .object({
        kind: z.enum(['issues', 'accounts', 'contacts']),
        /** ANDed; Pylon's own search filters, plus the lookup fields. */
        filters: z.array(z.union([leafSchema, groupSchema])),
        columns: z.array(z.string()),
        metrics: z.array(z.string()),
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
        const check = (
            values: string[],
            choices: readonly string[],
            path: string,
        ) =>
            values.forEach((value, index) => {
                if (!allowed(choices, value)) {
                    context.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: [path, index],
                        message: `"${value}" isn't a ${request.kind} ${path === 'metrics' ? 'metric' : 'column'}. Use one of: ${choices.join(', ')}`,
                    });
                }
            });
        check(request.columns, COLUMNS[request.kind], 'columns');
        check(request.metrics, METRICS[request.kind], 'metrics');
        if (request.columns.length + request.metrics.length === 0) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['columns'],
                message: 'Ask for at least one column or metric',
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
    requester: refSchema,
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
    contacts: Map<string, string>;
};

const NO_NAMES: Names = {
    accounts: new Map(),
    users: new Map(),
    contacts: new Map(),
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
        case 'requester_email':
            return nameOf(names.contacts, issue.requester);
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
            endpoint: path,
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
        {
            method: 'GET',
            path: PYLON_USERS_PATH,
            endpoint: PYLON_USERS_PATH,
            body: undefined,
        },
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

/** Values by ID from one search kind, 1,000 IDs a call. */
const readById = async ({
    calls,
    kind,
    field,
    ids,
    read,
}: {
    calls: LiveCalls;
    kind: 'accounts' | 'contacts';
    field: string;
    ids: string[];
    read: (record: PylonRecord) => [string, string | undefined];
}): Promise<Map<string, string>> => {
    const values = new Map<string, string>();
    const batches = chunk([...new Set(ids)], PAGE_SIZE);
    if (batches.length > MAX_NAME_CALLS) {
        throw tooManyRowsError({ label: LABEL, maxRows: PYLON_MAX_QUERY_ROWS });
    }
    for (const batch of batches) {
        // eslint-disable-next-line no-await-in-loop
        const { records } = await searchPage({
            calls,
            kind,
            filters: [{ field, operator: 'in', values: batch }],
            limit: PAGE_SIZE,
            cursor: undefined,
        });
        records.forEach((record) => {
            const [id, value] = read(record);
            if (value) {
                values.set(id, value);
            }
        });
    }
    return values;
};

const idsOf = (records: PylonRecord[], key: 'account' | 'requester') =>
    records.flatMap((record) => {
        const ref = (
            record as Partial<Record<typeof key, { id: string } | null>>
        )[key];
        return ref ? [ref.id] : [];
    });

/** Reads the names behind the IDs of the records, for the columns asked for. */
const readNames = async (
    calls: LiveCalls,
    records: PylonRecord[],
    columns: string[],
): Promise<Names> => ({
    accounts: columns.includes('account_name')
        ? await readById({
              calls,
              kind: 'accounts',
              field: 'account_id',
              ids: idsOf(records, 'account'),
              read: (record) => {
                  const { id, name } = record as PylonAccount;
                  return [id, name];
              },
          })
        : new Map(),
    users: columns.some(
        (column) => column === 'assignee_email' || column === 'owner_email',
    )
        ? new Map((await readUsers(calls)).map(({ id, email }) => [id, email]))
        : new Map(),
    contacts: columns.includes('requester_email')
        ? await readById({
              calls,
              kind: 'contacts',
              field: 'id',
              ids: idsOf(records, 'requester'),
              read: (record) => {
                  const { id, email } = record as PylonContact;
                  return [id, email];
              },
          })
        : new Map(),
});

const average = (values: unknown[]) => {
    const numbers = values.filter(
        (value): value is number => typeof value === 'number',
    );
    return numbers.length === 0
        ? null
        : round(
              numbers.reduce((total, value) => total + value, 0) /
                  numbers.length,
              2,
          );
};

/** The column a metric averages, per issue. */
const AVERAGED_COLUMNS: Record<string, string> = {
    average_first_response_minutes: 'first_response_minutes',
    average_resolution_hours: 'resolution_hours',
};

/** Groups records by the requested columns and works out each metric. */
const aggregate = ({
    kind,
    records,
    columns,
    metrics,
    names,
}: {
    kind: PylonKind;
    records: PylonRecord[];
    columns: string[];
    metrics: string[];
    names: Names;
}) => {
    const groups = new Map<
        string,
        { values: Record<string, unknown>; records: PylonRecord[] }
    >();
    records.forEach((record) => {
        const values = Object.fromEntries(
            columns.map((column) => [
                column,
                readColumn(kind, record, column, names),
            ]),
        );
        const key = JSON.stringify(columns.map((column) => values[column]));
        const group = groups.get(key) ?? { values, records: [] };
        group.records.push(record);
        groups.set(key, group);
    });
    // A total with nothing to group by is one row, even with no records
    if (columns.length === 0 && groups.size === 0) {
        groups.set('', { values: {}, records: [] });
    }
    return [...groups.values()].map(({ values, records: grouped }) => ({
        ...values,
        ...Object.fromEntries(
            metrics.map((name) => [
                name,
                name === 'count'
                    ? grouped.length
                    : average(
                          grouped.map((record) =>
                              readColumn(
                                  kind,
                                  record,
                                  AVERAGED_COLUMNS[name],
                                  names,
                              ),
                          ),
                      ),
            ]),
        ),
    }));
};

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

/**
 * Runs one Pylon request: one search, paged by cursor. Pylon has no totals,
 * so metrics read every matching record and are worked out here.
 */
export const runPylonQuery = async ({
    request,
    limit,
    calls,
}: LiveRunArgs<
    ApiConnectorType.PYLON,
    PylonRequest
>): Promise<LiveRunResult> => {
    assertMaxRows(limit, PYLON_MAX_QUERY_ROWS);
    const { kind, columns, metrics, sort } = request;
    const resultColumns = toColumns([...columns, ...metrics]);
    const isAggregate = metrics.length > 0;
    const filters = await resolveLookups(request.filters, calls);
    if (!filters) {
        return {
            columns: resultColumns,
            rows: isAggregate
                ? aggregate({
                      kind,
                      records: [],
                      columns,
                      metrics,
                      names: NO_NAMES,
                  })
                : [],
            hasMoreRows: false,
        };
    }
    // Metrics need every matching record, so they read up to the cap
    const requestedRows = isAggregate ? PYLON_MAX_QUERY_ROWS : limit;
    const { rows: records, hasMoreRows } = await readRowsWithinCap({
        label: LABEL,
        requestedRows,
        maxRows: PYLON_MAX_QUERY_ROWS,
        pageSize: Math.min(PAGE_SIZE, requestedRows + 1),
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
    const typedRecords = records as PylonRecord[];
    if (isAggregate && hasMoreRows) {
        throw tooManyRowsError({ label: LABEL, maxRows: PYLON_MAX_QUERY_ROWS });
    }
    const names = await readNames(calls, typedRecords, columns);
    if (isAggregate) {
        const groups = aggregate({
            kind,
            records: typedRecords,
            columns,
            metrics,
            names,
        });
        return {
            columns: resultColumns,
            rows: groups.slice(0, limit),
            hasMoreRows: groups.length > limit,
        };
    }
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
