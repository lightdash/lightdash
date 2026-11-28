import {
    ApiConnectorType,
    DimensionType,
    INTERCOM_PATHS,
    ParameterError,
} from '@lightdash/common';
import { z } from 'zod';
import {
    assertMaxRows,
    readRowsWithinCap,
    type LiveColumn,
    type LiveRunArgs,
    type LiveRunResult,
    type LiveRuntime,
} from '../../sdk';

const LABEL = 'Intercom';

/** Search reads at most 150 records a page. */
export const INTERCOM_PAGE_SIZE = 150;
const MAX_PAGES = 40;

/**
 * The most rows one query reads: one fewer than forty full pages, so reading
 * every page detects truncation.
 */
export const INTERCOM_MAX_QUERY_ROWS = INTERCOM_PAGE_SIZE * MAX_PAGES - 1;

/** Pages, plus the teammate and team lists that name IDs and resolve names. */
export const INTERCOM_CALLS_PER_QUERY = MAX_PAGES + 2;

/** Intercom caps each AND or OR group, and each IN or NIN list, at 15. */
export const INTERCOM_MAX_GROUP_SIZE = 15;

const ASSIGNEE_COLUMNS = [
    'team_assignee_id',
    'team_assignee_name',
    'admin_assignee_id',
    'admin_assignee_name',
] as const;

const COLUMNS = {
    conversations: [
        'id',
        'title',
        'state',
        'priority',
        'source_type',
        ...ASSIGNEE_COLUMNS,
        'tags',
        'tag_ids',
        'created_at',
        'created_at_week',
        'created_at_month',
        'updated_at',
        'updated_at_week',
        'updated_at_month',
        'last_closed_at',
        'last_closed_at_week',
        'last_closed_at_month',
        'first_admin_reply_at',
        'created_time',
        'waiting_since',
        'snoozed_until',
        'time_to_assignment_minutes',
        'time_to_admin_reply_minutes',
        'time_to_first_close_minutes',
        'time_to_last_close_minutes',
        'median_time_to_reply_minutes',
        'handling_time_minutes',
        'count_reopens',
        'count_assignments',
        'count_conversation_parts',
        'last_closed_by_id',
        'last_closed_by_name',
        'rating',
        'rating_remark',
        'rating_teammate_id',
        'rating_teammate_name',
        'rated_at',
        'sla_name',
        'sla_status',
        'ai_agent_participated',
        'ai_agent_resolution_state',
        'ai_agent_last_answer_type',
        'ai_agent_source_type',
        'ai_agent_source_title',
        'ai_agent_rating',
        'ai_agent_rating_remark',
    ],
    tickets: [
        'id',
        'ticket_id',
        'title',
        'category',
        'ticket_type_id',
        'ticket_type',
        'ticket_state',
        'ticket_state_category',
        'open',
        ...ASSIGNEE_COLUMNS,
        'created_at',
        'created_at_week',
        'created_at_month',
        'updated_at',
        'updated_at_week',
        'updated_at_month',
        'created_time',
        'snoozed_until',
    ],
    contacts: [
        'id',
        'role',
        'name',
        'email',
        'email_domain',
        'country',
        'created_at',
        'created_at_week',
        'created_at_month',
        'signed_up_at',
        'last_seen_at',
    ],
    teammates: [
        'id',
        'name',
        'email',
        'job_title',
        'away_mode_enabled',
        'has_inbox_seat',
        'team_names',
    ],
    teams: ['id', 'name', 'teammate_count'],
} as const;

export type IntercomKind = keyof typeof COLUMNS;

/** The kinds read by search; the others are whole lists. */
const SEARCH_KINDS = ['conversations', 'tickets', 'contacts'] as const;
type IntercomSearchKind = (typeof SEARCH_KINDS)[number];

const isSearchKind = (kind: IntercomKind): kind is IntercomSearchKind =>
    (SEARCH_KINDS as readonly string[]).includes(kind);

const SORT_FIELDS: Record<IntercomKind, readonly string[]> = {
    conversations: ['created_at', 'updated_at', 'waiting_since'],
    tickets: ['created_at', 'updated_at'],
    contacts: ['created_at', 'signed_up_at', 'last_seen_at'],
    teammates: [],
    teams: [],
};

const NUMBER_COLUMNS = new Set([
    'time_to_assignment_minutes',
    'time_to_admin_reply_minutes',
    'time_to_first_close_minutes',
    'time_to_last_close_minutes',
    'median_time_to_reply_minutes',
    'handling_time_minutes',
    'count_reopens',
    'count_assignments',
    'count_conversation_parts',
    'rating',
    'ai_agent_rating',
    'teammate_count',
]);

const DATE_COLUMNS = new Set([
    'created_at',
    'created_at_week',
    'created_at_month',
    'updated_at',
    'updated_at_week',
    'updated_at_month',
    'last_closed_at',
    'last_closed_at_week',
    'last_closed_at_month',
    'first_admin_reply_at',
    'signed_up_at',
    'last_seen_at',
]);

const TIMESTAMP_COLUMNS = new Set([
    'created_time',
    'waiting_since',
    'snoozed_until',
    'rated_at',
]);

const BOOLEAN_COLUMNS = new Set([
    'ai_agent_participated',
    'open',
    'away_mode_enabled',
    'has_inbox_seat',
]);

/**
 * Filters by name, turned into ID filters before the search: Intercom
 * searches teammates and teams by ID only.
 */
export const INTERCOM_LOOKUP_FIELDS = {
    team_assignee_name: { field: 'team_assignee_id', list: 'teams' },
    admin_assignee_name: { field: 'admin_assignee_id', list: 'admins' },
    last_closed_by_name: {
        field: 'statistics.last_closed_by_id',
        list: 'admins',
    },
    rating_teammate_name: {
        field: 'conversation_rating.admin_id',
        list: 'admins',
    },
} as const;

type LookupField = keyof typeof INTERCOM_LOOKUP_FIELDS;

const isLookupField = (fieldName: string): fieldName is LookupField =>
    Object.hasOwn(INTERCOM_LOOKUP_FIELDS, fieldName);

const valueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const leafSchema = z
    .object({
        field: z.string().min(1),
        operator: z.enum([
            '=',
            '!=',
            'IN',
            'NIN',
            '>',
            '>=',
            '<',
            '<=',
            '~',
            '!~',
            '^',
            '$',
        ]),
        value: z.union([
            valueSchema,
            // At most 15 values, checked with the request for a clear message
            z.array(z.union([z.string(), z.number()])).min(1),
        ]),
    })
    .strict()
    .superRefine((leaf, context) => {
        const isList = leaf.operator === 'IN' || leaf.operator === 'NIN';
        if (isList !== Array.isArray(leaf.value)) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['value'],
                message: isList
                    ? `${leaf.operator} takes a list of values`
                    : `${leaf.operator} takes one value`,
            });
        }
    });

const groupSchema = z
    .object({
        operator: z.enum(['AND', 'OR']),
        value: z
            .array(leafSchema)
            .min(1)
            .max(
                INTERCOM_MAX_GROUP_SIZE,
                `Intercom takes at most ${INTERCOM_MAX_GROUP_SIZE} filters in one AND or OR group`,
            ),
    })
    .strict();

export type IntercomFilterLeaf = z.infer<typeof leafSchema>;
export type IntercomFilter = IntercomFilterLeaf | z.infer<typeof groupSchema>;

/** One Intercom request, as compile writes it and agents send it. */
export const intercomRequestSchema = z
    .object({
        kind: z.enum([
            'conversations',
            'tickets',
            'contacts',
            'teammates',
            'teams',
        ]),
        /**
         * ANDed, Intercom's own search query; a group nests one level, as
         * Intercom allows. Names in `INTERCOM_LOOKUP_FIELDS` become IDs first.
         */
        filters: z
            .array(z.union([leafSchema, groupSchema]))
            .max(
                INTERCOM_MAX_GROUP_SIZE,
                `Intercom takes at most ${INTERCOM_MAX_GROUP_SIZE} filters in one AND or OR group`,
            ),
        columns: z.array(z.string()).min(1, 'Ask for at least one column'),
        sort: z
            .object({
                field: z.string(),
                order: z.enum(['ascending', 'descending']),
            })
            .strict()
            .optional(),
    })
    .strict()
    .superRefine((request, context) => {
        const allowed = (values: readonly string[], value: string) =>
            values.includes(value);
        request.columns.forEach((column, index) => {
            if (!allowed(COLUMNS[request.kind], column)) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['columns', index],
                    message: `"${column}" isn't a ${request.kind} column. Use one of: ${COLUMNS[request.kind].join(', ')}`,
                });
            }
        });
        if (!isSearchKind(request.kind) && request.filters.length > 0) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['filters'],
                message: `Intercom lists ${request.kind} whole; they take no filters`,
            });
        }
        if (
            request.sort &&
            !allowed(SORT_FIELDS[request.kind], request.sort.field)
        ) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['sort', 'field'],
                message: `Intercom sorts ${request.kind} by ${SORT_FIELDS[request.kind].join(', ') || 'nothing'}`,
            });
        }
        request.filters
            .flatMap((filter) => ('field' in filter ? [filter] : filter.value))
            .forEach((leaf) => {
                // Names become ID lists, split to size, before the search
                if (
                    !isLookupField(leaf.field) &&
                    Array.isArray(leaf.value) &&
                    leaf.value.length > INTERCOM_MAX_GROUP_SIZE
                ) {
                    context.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ['filters'],
                        message: `Intercom takes at most ${INTERCOM_MAX_GROUP_SIZE} values in one IN or NIN list; split ${leaf.field} into several`,
                    });
                }
            });
        request.filters.forEach((filter) => {
            // Lookups become ID filters before the search, so only at the top
            if ('field' in filter) {
                if (
                    isLookupField(filter.field) &&
                    filter.operator !== 'IN' &&
                    filter.operator !== 'NIN'
                ) {
                    context.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ['filters'],
                        message: `${filter.field} takes IN or NIN`,
                    });
                }
                return;
            }
            const nested = filter.value.find((leaf) =>
                isLookupField(leaf.field),
            );
            if (nested) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['filters'],
                    message: `${nested.field} can't be inside an AND or OR group`,
                });
            }
        });
    });

export type IntercomRequest = z.infer<typeof intercomRequestSchema>;

/** Intercom's IDs come as numbers or strings; 0 means unassigned. */
const idSchema = z.union([z.string(), z.number()]).nullable().optional();
const timeSchema = z.number().nullable().optional();
const textSchema = z.string().nullable().optional();

const conversationSchema = z.object({
    id: z.union([z.string(), z.number()]),
    title: textSchema,
    state: textSchema,
    priority: textSchema,
    source: z.object({ type: textSchema }).nullable().optional(),
    team_assignee_id: idSchema,
    admin_assignee_id: idSchema,
    tags: z
        .object({
            tags: z.array(
                z.object({
                    id: z.union([z.string(), z.number()]),
                    name: z.string(),
                }),
            ),
        })
        .nullable()
        .optional(),
    created_at: z.number(),
    updated_at: z.number(),
    waiting_since: timeSchema,
    snoozed_until: timeSchema,
    statistics: z
        .object({
            time_to_assignment: timeSchema,
            time_to_admin_reply: timeSchema,
            time_to_first_close: timeSchema,
            time_to_last_close: timeSchema,
            median_time_to_reply: timeSchema,
            handling_time: timeSchema,
            first_admin_reply_at: timeSchema,
            last_close_at: timeSchema,
            last_closed_by_id: idSchema,
            count_reopens: timeSchema,
            count_assignments: timeSchema,
            count_conversation_parts: timeSchema,
        })
        .nullable()
        .optional(),
    conversation_rating: z
        .object({
            rating: z.number().nullable().optional(),
            remark: textSchema,
            created_at: timeSchema,
            teammate: z.object({ id: idSchema }).nullable().optional(),
        })
        .nullable()
        .optional(),
    sla_applied: z
        .object({ sla_name: textSchema, sla_status: textSchema })
        .nullable()
        .optional(),
    ai_agent_participated: z.boolean().nullable().optional(),
    ai_agent: z
        .object({
            resolution_state: textSchema,
            last_answer_type: textSchema,
            source_type: textSchema,
            source_title: textSchema,
            rating: z.number().nullable().optional(),
            rating_remark: textSchema,
        })
        .nullable()
        .optional(),
});
type IntercomConversation = z.infer<typeof conversationSchema>;

const ticketSchema = z.object({
    id: z.union([z.string(), z.number()]),
    ticket_id: idSchema,
    category: textSchema,
    ticket_type: z
        .object({ id: idSchema, name: textSchema })
        .nullable()
        .optional(),
    ticket_state: z
        .object({ internal_label: textSchema, category: textSchema })
        .nullable()
        .optional(),
    ticket_attributes: z.record(z.string(), z.unknown()).nullable().optional(),
    open: z.boolean().nullable().optional(),
    team_assignee_id: idSchema,
    admin_assignee_id: idSchema,
    created_at: z.number(),
    updated_at: z.number(),
    snoozed_until: timeSchema,
});
type IntercomTicket = z.infer<typeof ticketSchema>;

const contactSchema = z.object({
    id: z.string(),
    role: textSchema,
    name: textSchema,
    email: textSchema,
    location: z.object({ country: textSchema }).nullable().optional(),
    created_at: timeSchema,
    signed_up_at: timeSchema,
    last_seen_at: timeSchema,
});
type IntercomContact = z.infer<typeof contactSchema>;

const pagesSchema = z
    .object({
        next: z
            .object({ starting_after: z.string().nullable().optional() })
            .nullable()
            .optional(),
    })
    .nullable()
    .optional();

const SEARCHES = {
    conversations: {
        path: INTERCOM_PATHS.conversationsSearch,
        schema: z.object({
            conversations: z.array(conversationSchema),
            pages: pagesSchema,
        }),
        records: 'conversations',
    },
    tickets: {
        path: INTERCOM_PATHS.ticketsSearch,
        schema: z.object({
            tickets: z.array(ticketSchema),
            pages: pagesSchema,
        }),
        records: 'tickets',
    },
    contacts: {
        path: INTERCOM_PATHS.contactsSearch,
        schema: z.object({
            data: z.array(contactSchema),
            pages: pagesSchema,
        }),
        records: 'data',
    },
} as const;

type IntercomRecord = IntercomConversation | IntercomTicket | IntercomContact;

const adminsSchema = z.object({
    admins: z.array(
        z.object({
            id: z.union([z.string(), z.number()]),
            name: textSchema,
            email: textSchema,
            job_title: textSchema,
            away_mode_enabled: z.boolean().nullable().optional(),
            has_inbox_seat: z.boolean().nullable().optional(),
            team_ids: z
                .array(z.union([z.string(), z.number()]))
                .nullable()
                .optional(),
        }),
    ),
});
type IntercomAdmin = z.infer<typeof adminsSchema>['admins'][number];

const teamsSchema = z.object({
    teams: z.array(
        z.object({
            id: z.union([z.string(), z.number()]),
            name: textSchema,
            admin_ids: z
                .array(z.union([z.string(), z.number()]))
                .nullable()
                .optional(),
        }),
    ),
});
type IntercomTeam = z.infer<typeof teamsSchema>['teams'][number];

/** An ID as text; Intercom reports 0 for unassigned. */
const toId = (id: string | number | null | undefined) =>
    id === null || id === undefined || String(id) === '0' || id === ''
        ? null
        : String(id);

const toTimestamp = (seconds: number | null | undefined) =>
    typeof seconds === 'number' && seconds > 0
        ? new Date(seconds * 1000).toISOString()
        : null;

const toDay = (seconds: number | null | undefined) =>
    toTimestamp(seconds)?.slice(0, 10) ?? null;

const DAY_MS = 86_400_000;

/** The Monday of a UTC day's week. */
const toWeek = (day: string | null) => {
    if (!day) return null;
    const date = new Date(`${day}T00:00:00Z`);
    const daysSinceMonday = (date.getUTCDay() + 6) % 7;
    return new Date(date.getTime() - daysSinceMonday * DAY_MS)
        .toISOString()
        .slice(0, 10);
};

/** The first day of a UTC day's month. */
const toMonth = (day: string | null) => (day ? `${day.slice(0, 7)}-01` : null);

const grain = (
    column: string,
    base: string,
    seconds: number | null | undefined,
) => {
    const day = toDay(seconds);
    if (column === base) return day;
    if (column === `${base}_week`) return toWeek(day);
    return toMonth(day);
};

const toMinutes = (seconds: number | null | undefined) =>
    typeof seconds === 'number' ? Math.round((seconds / 60) * 100) / 100 : null;

const toText = (value: string | null | undefined) =>
    typeof value === 'string' && value !== '' ? value : null;

const joinValues = (values: string[]) =>
    values.length > 0 ? values.join(', ') : null;

/** Teammate and team names by ID, read for the columns asked for. */
type Names = {
    admins: Map<string, string>;
    teams: Map<string, string>;
};

const nameOf = (names: Map<string, string>, id: string | null) =>
    id ? (names.get(id) ?? null) : null;

const readAssignee = (
    record: IntercomConversation | IntercomTicket,
    column: string,
    names: Names,
) => {
    const teamId = toId(record.team_assignee_id);
    const adminId = toId(record.admin_assignee_id);
    switch (column) {
        case 'team_assignee_id':
            return teamId;
        case 'team_assignee_name':
            return nameOf(names.teams, teamId);
        case 'admin_assignee_id':
            return adminId;
        default:
            return nameOf(names.admins, adminId);
    }
};

const readConversationColumn = (
    conversation: IntercomConversation,
    column: string,
    names: Names,
): unknown => {
    const stats = conversation.statistics;
    const rating = conversation.conversation_rating;
    const ai = conversation.ai_agent;
    if ((ASSIGNEE_COLUMNS as readonly string[]).includes(column)) {
        return readAssignee(conversation, column, names);
    }
    if (column.startsWith('created_at')) {
        return grain(column, 'created_at', conversation.created_at);
    }
    if (column.startsWith('updated_at')) {
        return grain(column, 'updated_at', conversation.updated_at);
    }
    if (column.startsWith('last_closed_at')) {
        return grain(column, 'last_closed_at', stats?.last_close_at);
    }
    switch (column) {
        case 'id':
            return String(conversation.id);
        case 'title':
            return toText(conversation.title);
        case 'state':
            return toText(conversation.state);
        case 'priority':
            return toText(conversation.priority);
        case 'source_type':
            return toText(conversation.source?.type);
        case 'tags':
            return joinValues(
                conversation.tags?.tags.map(({ name }) => name) ?? [],
            );
        case 'tag_ids':
            return joinValues(
                conversation.tags?.tags.map(({ id }) => String(id)) ?? [],
            );
        case 'first_admin_reply_at':
            return toDay(stats?.first_admin_reply_at);
        case 'created_time':
            return toTimestamp(conversation.created_at);
        case 'waiting_since':
            return toTimestamp(conversation.waiting_since);
        case 'snoozed_until':
            return toTimestamp(conversation.snoozed_until);
        case 'time_to_assignment_minutes':
            return toMinutes(stats?.time_to_assignment);
        case 'time_to_admin_reply_minutes':
            return toMinutes(stats?.time_to_admin_reply);
        case 'time_to_first_close_minutes':
            return toMinutes(stats?.time_to_first_close);
        case 'time_to_last_close_minutes':
            return toMinutes(stats?.time_to_last_close);
        case 'median_time_to_reply_minutes':
            return toMinutes(stats?.median_time_to_reply);
        case 'handling_time_minutes':
            return toMinutes(stats?.handling_time);
        case 'count_reopens':
            return stats?.count_reopens ?? null;
        case 'count_assignments':
            return stats?.count_assignments ?? null;
        case 'count_conversation_parts':
            return stats?.count_conversation_parts ?? null;
        case 'last_closed_by_id':
            return toId(stats?.last_closed_by_id);
        case 'last_closed_by_name':
            return nameOf(names.admins, toId(stats?.last_closed_by_id));
        case 'rating':
            return rating?.rating ?? null;
        case 'rating_remark':
            return toText(rating?.remark);
        case 'rating_teammate_id':
            return toId(rating?.teammate?.id);
        case 'rating_teammate_name':
            return nameOf(names.admins, toId(rating?.teammate?.id));
        case 'rated_at':
            return toTimestamp(rating?.created_at);
        case 'sla_name':
            return toText(conversation.sla_applied?.sla_name);
        case 'sla_status':
            return toText(conversation.sla_applied?.sla_status);
        case 'ai_agent_participated':
            return conversation.ai_agent_participated ?? null;
        case 'ai_agent_resolution_state':
            return toText(ai?.resolution_state);
        case 'ai_agent_last_answer_type':
            return toText(ai?.last_answer_type);
        case 'ai_agent_source_type':
            return toText(ai?.source_type);
        case 'ai_agent_source_title':
            return toText(ai?.source_title);
        case 'ai_agent_rating':
            return ai?.rating ?? null;
        case 'ai_agent_rating_remark':
            return toText(ai?.rating_remark);
        default:
            return null;
    }
};

/** Ticket categories as Intercom shows them, back to the values search takes. */
const TICKET_CATEGORIES: Record<string, string> = {
    Customer: 'request',
    'Back-office': 'task',
    Tracker: 'tracker',
};

const readTicketColumn = (
    ticket: IntercomTicket,
    column: string,
    names: Names,
): unknown => {
    if ((ASSIGNEE_COLUMNS as readonly string[]).includes(column)) {
        return readAssignee(ticket, column, names);
    }
    if (column.startsWith('created_at')) {
        return grain(column, 'created_at', ticket.created_at);
    }
    if (column.startsWith('updated_at')) {
        return grain(column, 'updated_at', ticket.updated_at);
    }
    switch (column) {
        case 'id':
            return String(ticket.id);
        case 'ticket_id':
            return toId(ticket.ticket_id);
        case 'title': {
            const title = ticket.ticket_attributes?._default_title_;
            return typeof title === 'string' && title !== '' ? title : null;
        }
        case 'category':
            return ticket.category
                ? (TICKET_CATEGORIES[ticket.category] ?? ticket.category)
                : null;
        case 'ticket_type_id':
            return toId(ticket.ticket_type?.id);
        case 'ticket_type':
            return toText(ticket.ticket_type?.name);
        case 'ticket_state':
            return toText(ticket.ticket_state?.internal_label);
        case 'ticket_state_category':
            return toText(ticket.ticket_state?.category);
        case 'open':
            return ticket.open ?? null;
        case 'created_time':
            return toTimestamp(ticket.created_at);
        case 'snoozed_until':
            return toTimestamp(ticket.snoozed_until);
        default:
            return null;
    }
};

const readContactColumn = (
    contact: IntercomContact,
    column: string,
): unknown => {
    if (column.startsWith('created_at')) {
        return grain(column, 'created_at', contact.created_at);
    }
    switch (column) {
        case 'id':
            return contact.id;
        case 'role':
            return toText(contact.role);
        case 'name':
            return toText(contact.name);
        case 'email':
            return toText(contact.email);
        case 'email_domain': {
            const email = toText(contact.email);
            return email?.includes('@')
                ? email.slice(email.lastIndexOf('@') + 1).toLowerCase()
                : null;
        }
        case 'country':
            return toText(contact.location?.country);
        case 'signed_up_at':
            return toDay(contact.signed_up_at);
        case 'last_seen_at':
            return toDay(contact.last_seen_at);
        default:
            return null;
    }
};

const readRecordColumn = (
    kind: IntercomSearchKind,
    record: IntercomRecord,
    column: string,
    names: Names,
) => {
    switch (kind) {
        case 'conversations':
            return readConversationColumn(
                record as IntercomConversation,
                column,
                names,
            );
        case 'tickets':
            return readTicketColumn(record as IntercomTicket, column, names);
        default:
            return readContactColumn(record as IntercomContact, column);
    }
};

const readAdmins = async (runtime: LiveRuntime) =>
    (
        await runtime.fetch(
            { method: 'GET', path: INTERCOM_PATHS.admins, body: undefined },
            adminsSchema,
        )
    ).admins;

const readTeams = async (runtime: LiveRuntime) =>
    (
        await runtime.fetch(
            { method: 'GET', path: INTERCOM_PATHS.teams, body: undefined },
            teamsSchema,
        )
    ).teams;

const toNames = (list: Array<{ id: string | number; name?: string | null }>) =>
    new Map(list.flatMap(({ id, name }) => (name ? [[String(id), name]] : [])));

/** Reads each list once per query, only when something needs it. */
const listReader = (runtime: LiveRuntime) => {
    let admins: Promise<IntercomAdmin[]> | undefined;
    let teams: Promise<IntercomTeam[]> | undefined;
    return {
        admins: () => {
            admins ??= readAdmins(runtime);
            return admins;
        },
        teams: () => {
            teams ??= readTeams(runtime);
            return teams;
        },
    };
};
type Lists = ReturnType<typeof listReader>;

/** IDs of the teammates or teams with these names; names match exactly. */
const findIds = async (
    lists: Lists,
    list: 'admins' | 'teams',
    names: (string | number)[],
) => {
    const wanted = new Set(names.map((name) => String(name).trim()));
    const records = await lists[list]();
    return records
        .filter(({ name }) => !!name && wanted.has(name))
        .map(({ id }) => Number(id));
};

/**
 * IDs in lists of at most 15, as Intercom takes them: IN matches any list,
 * NIN must miss every list.
 */
const toIdFilters = (
    field: string,
    operator: string,
    ids: number[],
): IntercomFilter[] => {
    const lists = Array.from(
        { length: Math.ceil(ids.length / INTERCOM_MAX_GROUP_SIZE) },
        (_, index): IntercomFilterLeaf => ({
            field,
            operator: operator === 'NIN' ? 'NIN' : 'IN',
            value: ids.slice(
                index * INTERCOM_MAX_GROUP_SIZE,
                (index + 1) * INTERCOM_MAX_GROUP_SIZE,
            ),
        }),
    );
    if (operator === 'NIN' || lists.length === 1) return lists;
    if (lists.length > INTERCOM_MAX_GROUP_SIZE) {
        throw new ParameterError(
            `Intercom takes at most ${INTERCOM_MAX_GROUP_SIZE * INTERCOM_MAX_GROUP_SIZE} ${field} values in one filter; pick fewer`,
        );
    }
    return [{ operator: 'OR', value: lists }];
};

/**
 * Turns name filters into Intercom's ID filters. Null when an IN lookup
 * matched nothing, so nothing can match the search.
 */
const resolveLookups = async (
    filters: IntercomFilter[],
    lists: Lists,
): Promise<IntercomFilter[] | null> => {
    const resolved: IntercomFilter[] = [];
    for (const filter of filters) {
        if (!('field' in filter) || !isLookupField(filter.field)) {
            resolved.push(filter);
        } else {
            const lookup = INTERCOM_LOOKUP_FIELDS[filter.field];
            const values = Array.isArray(filter.value) ? filter.value : [];
            // eslint-disable-next-line no-await-in-loop
            const ids = await findIds(lists, lookup.list, values);
            if (ids.length === 0 && filter.operator === 'IN') {
                return null;
            }
            if (ids.length > 0) {
                resolved.push(
                    ...toIdFilters(lookup.field, filter.operator, ids),
                );
            }
        }
    }
    if (resolved.length > INTERCOM_MAX_GROUP_SIZE) {
        throw new ParameterError(
            `Intercom takes at most ${INTERCOM_MAX_GROUP_SIZE} filters in one AND group; exclude fewer teammates or teams`,
        );
    }
    return resolved;
};

/**
 * Search needs a query: no filters reads every contact by matching both
 * roles. Conversations and tickets always carry their date range.
 */
const toQuery = (kind: IntercomSearchKind, filters: IntercomFilter[]) => {
    if (filters.length === 1) return filters[0];
    if (filters.length > 1) return { operator: 'AND', value: filters };
    return kind === 'contacts'
        ? { field: 'role', operator: 'IN', value: ['user', 'lead'] }
        : { field: 'created_at', operator: '>', value: 0 };
};

const searchPage = async ({
    runtime,
    kind,
    filters,
    sort,
    perPage,
    cursor,
}: {
    runtime: LiveRuntime;
    kind: IntercomSearchKind;
    filters: IntercomFilter[];
    sort: IntercomRequest['sort'];
    perPage: number;
    cursor: string | undefined;
}) => {
    const search = SEARCHES[kind];
    const response = (await runtime.fetch(
        {
            method: 'POST',
            path: search.path,
            body: {
                query: toQuery(kind, filters),
                pagination: {
                    per_page: perPage,
                    ...(cursor ? { starting_after: cursor } : {}),
                },
                ...(sort ? { sort } : {}),
            },
        },
        search.schema as z.ZodType<
            Record<string, unknown> & {
                pages?: z.infer<typeof pagesSchema>;
            }
        >,
    )) as Record<string, unknown> & { pages?: z.infer<typeof pagesSchema> };
    return {
        records: response[search.records] as IntercomRecord[],
        nextCursor: response.pages?.next?.starting_after || undefined,
    };
};

const toColumns = (names: readonly string[]): LiveColumn[] =>
    names.map((name) => {
        if (DATE_COLUMNS.has(name)) return { name, type: DimensionType.DATE };
        if (TIMESTAMP_COLUMNS.has(name)) {
            return { name, type: DimensionType.TIMESTAMP };
        }
        if (BOOLEAN_COLUMNS.has(name)) {
            return { name, type: DimensionType.BOOLEAN };
        }
        return {
            name,
            type: NUMBER_COLUMNS.has(name)
                ? DimensionType.NUMBER
                : DimensionType.STRING,
        };
    });

const ADMIN_NAME_COLUMNS = [
    'admin_assignee_name',
    'last_closed_by_name',
    'rating_teammate_name',
];

const readNames = async (lists: Lists, columns: string[]): Promise<Names> => ({
    admins: columns.some((column) => ADMIN_NAME_COLUMNS.includes(column))
        ? toNames(await lists.admins())
        : new Map(),
    teams: columns.includes('team_assignee_name')
        ? toNames(await lists.teams())
        : new Map(),
});

/** A whole list: teammates with their team names, or teams with their size. */
const readList = async (
    kind: 'teammates' | 'teams',
    columns: string[],
    lists: Lists,
) => {
    if (kind === 'teams') {
        const teams = await lists.teams();
        return teams.map((team) =>
            Object.fromEntries(
                columns.map((column) => {
                    switch (column) {
                        case 'id':
                            return [column, String(team.id)];
                        case 'name':
                            return [column, toText(team.name)];
                        default:
                            return [column, team.admin_ids?.length ?? 0];
                    }
                }),
            ),
        );
    }
    const admins = await lists.admins();
    const teamNames = columns.includes('team_names')
        ? toNames(await lists.teams())
        : new Map<string, string>();
    return admins.map((admin) =>
        Object.fromEntries(
            columns.map((column) => {
                switch (column) {
                    case 'id':
                        return [column, String(admin.id)];
                    case 'name':
                        return [column, toText(admin.name)];
                    case 'email':
                        return [column, toText(admin.email)];
                    case 'job_title':
                        return [column, toText(admin.job_title)];
                    case 'away_mode_enabled':
                        return [column, admin.away_mode_enabled ?? null];
                    case 'has_inbox_seat':
                        return [column, admin.has_inbox_seat ?? null];
                    default:
                        return [
                            column,
                            joinValues(
                                (admin.team_ids ?? []).flatMap(
                                    (id) => teamNames.get(String(id)) ?? [],
                                ),
                            ),
                        ];
                }
            }),
        ),
    );
};

/** Runs one Intercom request: one search paged by cursor, or one list. */
export const runIntercomQuery = async ({
    request,
    limit,
    runtime,
}: LiveRunArgs<
    ApiConnectorType.INTERCOM,
    IntercomRequest
>): Promise<LiveRunResult> => {
    assertMaxRows(limit, INTERCOM_MAX_QUERY_ROWS);
    const { kind, columns, sort } = request;
    const resultColumns = toColumns(columns);
    const lists = listReader(runtime);
    if (!isSearchKind(kind)) {
        const rows = await readList(kind, columns, lists);
        return {
            columns: resultColumns,
            rows: rows.slice(0, limit),
            hasMoreRows: rows.length > limit,
        };
    }
    const filters = await resolveLookups(request.filters, lists);
    if (!filters) {
        return { columns: resultColumns, rows: [], hasMoreRows: false };
    }
    const { rows: records, hasMoreRows } = await readRowsWithinCap({
        label: LABEL,
        requestedRows: limit,
        maxRows: INTERCOM_MAX_QUERY_ROWS,
        pageSize: INTERCOM_PAGE_SIZE,
        maxPages: MAX_PAGES,
        fetchPage: async ({ limit: perPage, cursor }) => {
            const page = await searchPage({
                runtime,
                kind,
                filters,
                sort,
                perPage,
                cursor,
            });
            return {
                rows: page.records as Record<string, unknown>[],
                nextCursor: page.nextCursor,
            };
        },
    });
    const names = await readNames(lists, columns);
    return {
        columns: resultColumns,
        rows: (records as IntercomRecord[]).map((record) =>
            Object.fromEntries(
                columns.map((column) => [
                    column,
                    readRecordColumn(kind, record, column, names),
                ]),
            ),
        ),
        hasMoreRows,
    };
};
