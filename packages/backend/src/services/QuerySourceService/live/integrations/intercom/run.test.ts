import {
    ApiConnectorType,
    DimensionType,
    ParameterError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { intercomIntegration } from '.';
import { parseLiveRequest } from '../../integration';
import { connectLiveSource } from '../../liveSource.mock';
import { type LiveHttpResponse } from '../../types';
import { toIntercomError } from './api';
import { summarizeIntercomTest } from './connection';
import { INTERCOM_MAX_QUERY_ROWS } from './run';

// Synthetic fixtures only: never paste rows from a real Intercom workspace here.

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
            intercomIntegration,
            { connector: ApiConnectorType.INTERCOM },
            send,
        ),
    };
};

const CREATED = Date.parse('2026-11-04T09:30:00Z') / 1000;

const conversation = (id: number, overrides: Record<string, unknown> = {}) => ({
    type: 'conversation',
    id: String(id),
    title: null,
    state: 'closed',
    priority: 'not_priority',
    source: { type: 'conversation', delivered_as: 'customer_initiated' },
    team_assignee_id: 7,
    admin_assignee_id: 0,
    tags: {
        type: 'tag.list',
        tags: [
            { type: 'tag', id: '11', name: 'billing' },
            { type: 'tag', id: '12', name: 'urgent' },
        ],
    },
    created_at: CREATED,
    updated_at: CREATED + 3_600,
    waiting_since: null,
    snoozed_until: null,
    statistics: {
        type: 'conversation_statistics',
        time_to_assignment: 0,
        time_to_admin_reply: 754,
        time_to_first_close: 5_400,
        time_to_last_close: 5_400,
        median_time_to_reply: 600,
        handling_time: 4_200,
        first_admin_reply_at: CREATED + 754,
        last_close_at: CREATED + 5_400,
        last_closed_by_id: '501',
        count_reopens: 0,
        count_assignments: 1,
        count_conversation_parts: 6,
    },
    conversation_rating: {
        rating: 4,
        remark: 'Quick answer',
        created_at: CREATED + 7_200,
        teammate: { type: 'admin', id: '501' },
    },
    sla_applied: {
        type: 'conversation_sla_summary',
        sla_name: 'First reply in an hour',
        sla_status: 'hit',
    },
    ai_agent_participated: true,
    ai_agent: {
        source_type: 'workflow',
        source_title: 'Fin for billing',
        last_answer_type: 'ai_answer',
        resolution_state: 'escalated',
        rating: null,
        rating_remark: null,
    },
    ...overrides,
});

const conversations = (records: unknown[], next?: string) =>
    response({
        type: 'conversation.list',
        conversations: records,
        total_count: records.length,
        pages: {
            type: 'pages',
            page: 1,
            per_page: 150,
            total_pages: next ? 2 : 1,
            ...(next ? { next: { page: 2, starting_after: next } } : {}),
        },
    });

const ADMINS = response({
    type: 'admin.list',
    admins: [
        {
            type: 'admin',
            id: '501',
            name: 'Ada Example',
            email: 'ada@example.com',
            job_title: 'Support lead',
            away_mode_enabled: false,
            has_inbox_seat: true,
            team_ids: [7],
        },
        {
            type: 'admin',
            id: '502',
            name: 'Grace Example',
            email: 'grace@example.com',
            away_mode_enabled: true,
            has_inbox_seat: true,
            team_ids: [],
        },
    ],
});

const TEAMS = response({
    type: 'team.list',
    teams: [
        { type: 'team', id: '7', name: 'Billing', admin_ids: [501] },
        { type: 'team', id: '8', name: 'Onboarding', admin_ids: [] },
    ],
});

const LAST_30_DAYS = [
    { field: 'created_at', operator: '>=', value: 1_792_281_600 },
    { field: 'created_at', operator: '<', value: 1_794_873_600 },
];

const run = (
    source: ReturnType<typeof connect>['source'],
    request: Record<string, unknown>,
    limit = 10,
) =>
    source.run({
        query: JSON.stringify({ filters: [], ...request }),
        limit,
    });

describe('intercomIntegration conversations', () => {
    it('searches over cursor pages, asking only for what is left', async () => {
        const { source, send } = connect(
            conversations([conversation(1), conversation(2)], 'cursor-2'),
            conversations([conversation(3)]),
        );

        const result = await run(
            source,
            {
                kind: 'conversations',
                filters: LAST_30_DAYS,
                columns: ['id', 'created_at_week'],
                sort: { field: 'created_at', order: 'descending' },
            },
            5,
        );

        expect(send).toHaveBeenNthCalledWith(1, {
            method: 'POST',
            path: '/conversations/search',
            body: {
                query: { operator: 'AND', value: LAST_30_DAYS },
                pagination: { per_page: 6 },
                sort: { field: 'created_at', order: 'descending' },
            },
        });
        expect(send).toHaveBeenNthCalledWith(2, {
            method: 'POST',
            path: '/conversations/search',
            body: {
                query: { operator: 'AND', value: LAST_30_DAYS },
                pagination: { per_page: 4, starting_after: 'cursor-2' },
                sort: { field: 'created_at', order: 'descending' },
            },
        });
        expect(result.rows).toEqual([
            { id: '1', created_at_week: '2026-11-02' },
            { id: '2', created_at_week: '2026-11-02' },
            { id: '3', created_at_week: '2026-11-02' },
        ]);
        expect(result.hasMoreRows).toBe(false);
    });

    it("reads Intercom's statistics, rating, SLA and Fin outcome, naming teammates and teams", async () => {
        const { source, send } = connect(
            conversations([conversation(1)]),
            ADMINS,
            TEAMS,
        );

        const result = await run(source, {
            kind: 'conversations',
            filters: LAST_30_DAYS,
            columns: [
                'team_assignee_id',
                'team_assignee_name',
                'admin_assignee_id',
                'admin_assignee_name',
                'tags',
                'tag_ids',
                'source_type',
                'last_closed_at',
                'created_time',
                'time_to_admin_reply_minutes',
                'handling_time_minutes',
                'time_to_assignment_minutes',
                'last_closed_by_name',
                'rating',
                'rating_teammate_name',
                'rated_at',
                'sla_status',
                'ai_agent_participated',
                'ai_agent_resolution_state',
                'ai_agent_rating',
            ],
        });

        expect(send).toHaveBeenCalledTimes(3);
        expect(result.rows).toEqual([
            {
                team_assignee_id: '7',
                team_assignee_name: 'Billing',
                admin_assignee_id: null,
                admin_assignee_name: null,
                tags: 'billing, urgent',
                tag_ids: '11, 12',
                source_type: 'conversation',
                last_closed_at: '2026-11-04',
                created_time: '2026-11-04T09:30:00.000Z',
                time_to_admin_reply_minutes: 12.57,
                handling_time_minutes: 70,
                time_to_assignment_minutes: 0,
                last_closed_by_name: 'Ada Example',
                rating: 4,
                rating_teammate_name: 'Ada Example',
                rated_at: '2026-11-04T11:30:00.000Z',
                sla_status: 'hit',
                ai_agent_participated: true,
                ai_agent_resolution_state: 'escalated',
                ai_agent_rating: null,
            },
        ]);
        expect(
            result.columns.filter(({ type }) => type !== DimensionType.STRING),
        ).toEqual([
            { name: 'last_closed_at', type: DimensionType.DATE },
            { name: 'created_time', type: DimensionType.TIMESTAMP },
            {
                name: 'time_to_admin_reply_minutes',
                type: DimensionType.NUMBER,
            },
            { name: 'handling_time_minutes', type: DimensionType.NUMBER },
            { name: 'time_to_assignment_minutes', type: DimensionType.NUMBER },
            { name: 'rating', type: DimensionType.NUMBER },
            { name: 'rated_at', type: DimensionType.TIMESTAMP },
            { name: 'ai_agent_participated', type: DimensionType.BOOLEAN },
            { name: 'ai_agent_rating', type: DimensionType.NUMBER },
        ]);
    });

    it('reads conversations without statistics, rating or Fin as empty', async () => {
        const { source } = connect(
            conversations([
                conversation(1, {
                    statistics: null,
                    conversation_rating: null,
                    sla_applied: null,
                    ai_agent: null,
                    tags: { type: 'tag.list', tags: [] },
                }),
            ]),
        );

        const result = await run(source, {
            kind: 'conversations',
            filters: LAST_30_DAYS,
            columns: [
                'time_to_admin_reply_minutes',
                'last_closed_at_month',
                'rating',
                'sla_name',
                'ai_agent_resolution_state',
                'tags',
            ],
        });

        expect(result.rows).toEqual([
            {
                time_to_admin_reply_minutes: null,
                last_closed_at_month: null,
                rating: null,
                sla_name: null,
                ai_agent_resolution_state: null,
                tags: null,
            },
        ]);
    });

    it('turns team and teammate names into ID filters before the search', async () => {
        const { source, send } = connect(
            TEAMS,
            ADMINS,
            conversations([conversation(1)]),
        );

        await run(source, {
            kind: 'conversations',
            filters: [
                ...LAST_30_DAYS,
                {
                    field: 'team_assignee_name',
                    operator: 'IN',
                    value: ['Billing'],
                },
                {
                    field: 'last_closed_by_name',
                    operator: 'NIN',
                    value: ['Grace Example', 'Nobody'],
                },
            ],
            columns: ['id'],
        });

        expect(send).toHaveBeenNthCalledWith(1, {
            method: 'GET',
            path: '/teams',
            body: undefined,
        });
        expect(send.mock.calls[2][0].body.query).toEqual({
            operator: 'AND',
            value: [
                ...LAST_30_DAYS,
                { field: 'team_assignee_id', operator: 'IN', value: [7] },
                {
                    field: 'statistics.last_closed_by_id',
                    operator: 'NIN',
                    value: [502],
                },
            ],
        });
    });

    it('splits names that match more than 15 teammates into lists of 15', async () => {
        const admins = Array.from({ length: 20 }, (_, index) => ({
            type: 'admin',
            id: String(600 + index),
            name: `Teammate ${index}`,
            email: `teammate-${index}@example.com`,
            away_mode_enabled: false,
            has_inbox_seat: true,
            team_ids: [],
        }));
        const names = admins.map(({ name }) => name);
        const ids = admins.map(({ id }) => Number(id));
        const adminList = response({ type: 'admin.list', admins });
        const { source, send } = connect(
            adminList,
            conversations([conversation(1)]),
            adminList,
            conversations([conversation(2)]),
        );

        await run(source, {
            kind: 'conversations',
            filters: [
                ...LAST_30_DAYS,
                { field: 'admin_assignee_name', operator: 'IN', value: names },
            ],
            columns: ['id'],
        });
        await run(source, {
            kind: 'conversations',
            filters: [
                ...LAST_30_DAYS,
                { field: 'admin_assignee_name', operator: 'NIN', value: names },
            ],
            columns: ['id'],
        });

        expect(send.mock.calls[1][0].body.query.value).toEqual([
            ...LAST_30_DAYS,
            {
                operator: 'OR',
                value: [
                    {
                        field: 'admin_assignee_id',
                        operator: 'IN',
                        value: ids.slice(0, 15),
                    },
                    {
                        field: 'admin_assignee_id',
                        operator: 'IN',
                        value: ids.slice(15),
                    },
                ],
            },
        ]);
        expect(send.mock.calls.at(-1)?.[0].body.query.value).toEqual([
            ...LAST_30_DAYS,
            {
                field: 'admin_assignee_id',
                operator: 'NIN',
                value: ids.slice(0, 15),
            },
            {
                field: 'admin_assignee_id',
                operator: 'NIN',
                value: ids.slice(15),
            },
        ]);
    });

    it('answers nothing without searching when a name matches no one', async () => {
        const { source, send } = connect(ADMINS);

        const result = await run(source, {
            kind: 'conversations',
            filters: [
                ...LAST_30_DAYS,
                {
                    field: 'admin_assignee_name',
                    operator: 'IN',
                    value: ['Nobody'],
                },
            ],
            columns: ['id'],
        });

        expect(send).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({
            columns: [{ name: 'id', type: DimensionType.STRING }],
            rows: [],
            hasMoreRows: false,
        });
    });

    it('says there are more rows when a page is left over', async () => {
        const { source } = connect(
            conversations([conversation(1), conversation(2)], 'more'),
        );

        const result = await run(
            source,
            { kind: 'conversations', filters: LAST_30_DAYS, columns: ['id'] },
            1,
        );

        expect(result.rows).toEqual([{ id: '1' }]);
        expect(result.hasMoreRows).toBe(true);
    });

    it('refuses a limit past what one query can read', async () => {
        const { source, send } = connect();

        await expect(
            run(
                source,
                {
                    kind: 'conversations',
                    filters: LAST_30_DAYS,
                    columns: ['id'],
                },
                INTERCOM_MAX_QUERY_ROWS + 1,
            ),
        ).rejects.toThrow(ParameterError);
        expect(send).not.toHaveBeenCalled();
    });

    it('fails clearly on an unexpected response shape', async () => {
        const { source } = connect(response({ type: 'conversation.list' }));

        await expect(
            run(source, {
                kind: 'conversations',
                filters: LAST_30_DAYS,
                columns: ['id'],
            }),
        ).rejects.toThrow();
    });
});

describe('intercomIntegration requests', () => {
    it.each([
        [
            'a column the kind lacks',
            { kind: 'tickets', columns: ['rating'] },
            '"rating" isn\'t a tickets column',
        ],
        [
            'filters on a list',
            {
                kind: 'teams',
                filters: [{ field: 'name', operator: '=', value: 'x' }],
                columns: ['name'],
            },
            'they take no filters',
        ],
        [
            'more than 15 values in a list',
            {
                kind: 'conversations',
                filters: [
                    {
                        field: 'id',
                        operator: 'IN',
                        value: Array.from({ length: 16 }, String),
                    },
                ],
                columns: ['id'],
            },
            'at most 15 values',
        ],
        [
            'a nested name lookup',
            {
                kind: 'conversations',
                filters: [
                    {
                        operator: 'OR',
                        value: [
                            {
                                field: 'team_assignee_name',
                                operator: 'IN',
                                value: ['Billing'],
                            },
                        ],
                    },
                ],
                columns: ['id'],
            },
            "can't be inside an AND or OR group",
        ],
        [
            'a sort Intercom lacks',
            {
                kind: 'tickets',
                columns: ['id'],
                sort: { field: 'title', order: 'ascending' },
            },
            'Intercom sorts tickets by created_at, updated_at',
        ],
    ])('refuses %s', (_, request, message) => {
        expect(() =>
            parseLiveRequest(
                intercomIntegration,
                JSON.stringify({ filters: [], ...request }),
            ),
        ).toThrow(message);
    });
});

describe('intercomIntegration tickets and contacts', () => {
    it('reads tickets with their type, state and category as search takes it', async () => {
        const { source, send } = connect(
            response({
                type: 'ticket.list',
                tickets: [
                    {
                        type: 'ticket',
                        id: '900',
                        ticket_id: '12',
                        category: 'Back-office',
                        ticket_type: { id: '3', name: 'Refund request' },
                        ticket_state: {
                            internal_label: 'In progress',
                            category: 'in_progress',
                        },
                        ticket_attributes: { _default_title_: 'Refund' },
                        open: true,
                        team_assignee_id: '0',
                        admin_assignee_id: 501,
                        created_at: CREATED,
                        updated_at: CREATED,
                    },
                ],
                total_count: 1,
                pages: { type: 'pages', page: 1, per_page: 150 },
            }),
            ADMINS,
        );

        const result = await run(source, {
            kind: 'tickets',
            filters: LAST_30_DAYS,
            columns: [
                'id',
                'ticket_id',
                'title',
                'category',
                'ticket_type',
                'ticket_state',
                'ticket_state_category',
                'open',
                'team_assignee_id',
                'admin_assignee_name',
                'created_at_month',
            ],
        });

        expect(send.mock.calls[0][0].path).toBe('/tickets/search');
        expect(result.rows).toEqual([
            {
                id: '900',
                ticket_id: '12',
                title: 'Refund',
                category: 'task',
                ticket_type: 'Refund request',
                ticket_state: 'In progress',
                ticket_state_category: 'in_progress',
                open: true,
                team_assignee_id: null,
                admin_assignee_name: 'Ada Example',
                created_at_month: '2026-11-01',
            },
        ]);
    });

    it('searches every contact by role when nothing filters them', async () => {
        const { source, send } = connect(
            response({
                type: 'list',
                data: [
                    {
                        type: 'contact',
                        id: 'c-1',
                        role: 'lead',
                        name: 'Sam',
                        email: 'sam@Example.org',
                        location: { country: 'Portugal' },
                        created_at: CREATED,
                        signed_up_at: null,
                        last_seen_at: CREATED,
                    },
                ],
                total_count: 1,
                pages: { type: 'pages', page: 1, per_page: 150 },
            }),
        );

        const result = await run(source, {
            kind: 'contacts',
            columns: ['role', 'email_domain', 'country', 'signed_up_at'],
        });

        expect(send.mock.calls[0][0]).toEqual({
            method: 'POST',
            path: '/contacts/search',
            body: {
                query: {
                    field: 'role',
                    operator: 'IN',
                    value: ['user', 'lead'],
                },
                pagination: { per_page: 11 },
            },
        });
        expect(result.rows).toEqual([
            {
                role: 'lead',
                email_domain: 'example.org',
                country: 'Portugal',
                signed_up_at: null,
            },
        ]);
    });
});

describe('intercomIntegration teammates and teams', () => {
    it('lists teammates with the names of their teams', async () => {
        const { source } = connect(ADMINS, TEAMS);

        const result = await run(source, {
            kind: 'teammates',
            columns: ['name', 'away_mode_enabled', 'team_names'],
        });

        expect(result.rows).toEqual([
            {
                name: 'Ada Example',
                away_mode_enabled: false,
                team_names: 'Billing',
            },
            {
                name: 'Grace Example',
                away_mode_enabled: true,
                team_names: null,
            },
        ]);
    });

    it('lists teams with their size, up to the limit', async () => {
        const { source } = connect(TEAMS);

        const result = await run(
            source,
            { kind: 'teams', columns: ['name', 'teammate_count'] },
            1,
        );

        expect(result.rows).toEqual([{ name: 'Billing', teammate_count: 1 }]);
        expect(result.hasMoreRows).toBe(true);
    });
});

describe('toIntercomError', () => {
    const NOW = Date.parse('2026-11-17T12:00:00Z');

    it('waits for the window Intercom names on a 429', () => {
        const error = toIntercomError(
            response(
                {
                    type: 'error.list',
                    errors: [
                        {
                            code: 'rate_limit_exceeded',
                            message: 'Exceeded rate limit of 167 in 10_seconds',
                        },
                    ],
                },
                429,
                { 'x-ratelimit-reset': String(NOW / 1000 + 7) },
            ),
            NOW,
        );
        expect(error).toBeInstanceOf(TooManyRequestsError);
        expect(error.message).toBe(
            'Intercom rate limit reached: Exceeded rate limit of 167 in 10_seconds. Every private app in the workspace shares 10,000 calls a minute; retry in 7 seconds.',
        );
    });

    it('retries shortly on a 429 without headers', () => {
        expect(toIntercomError(response({}, 429), NOW).message).toContain(
            'retry shortly',
        );
    });

    it.each([
        [401, WarehouseConnectionError, 'rejected the access token'],
        [403, WarehouseConnectionError, 'read permissions'],
        [400, WarehouseQueryError, 'Check the filter values'],
        [503, UnexpectedServerError, 'Intercom returned 503'],
    ])('explains a %i', (status, type, message) => {
        const error = toIntercomError(
            response(
                {
                    type: 'error.list',
                    errors: [{ code: 'parameter_invalid', message: 'Bad' }],
                },
                status,
            ),
        );
        expect(error).toBeInstanceOf(type);
        expect(error.message).toContain(message);
    });

    it('turns a failed search into the error', async () => {
        const { source } = connect(response({ errors: [] }, 401));
        await expect(
            run(source, {
                kind: 'conversations',
                filters: LAST_30_DAYS,
                columns: ['id'],
            }),
        ).rejects.toThrow(WarehouseConnectionError);
    });
});

describe('summarizeIntercomTest', () => {
    it("names the token's workspace and region", () => {
        expect(
            summarizeIntercomTest({
                type: 'admin',
                id: '501',
                app: { name: 'Example Co', region: 'EU', id_code: 'abc' },
            }),
        ).toEqual({
            summary: 'Connected to your Intercom workspace',
            facts: [
                { label: 'Workspace', value: 'Example Co' },
                { label: 'Region', value: 'EU' },
            ],
        });
    });

    it('is null for another shape', () => {
        expect(summarizeIntercomTest({ admins: [] })).toBeNull();
    });
});
