import {
    ApiConnectorType,
    FilterOperator,
    getApiSourceQueryIssues,
    SupportedDbtAdapter,
    UnitOfTime,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { intercomIntegration } from '.';
import {
    buildLiveExplore,
    type LiveExploreDefinition,
} from '../../explores/definition';
import { parseLiveRequest } from '../../integration';
import { compileIntercomQuery } from './compile';
import {
    INTERCOM_CONTACTS_EXPLORE,
    INTERCOM_CONVERSATIONS_EXPLORE,
    INTERCOM_TEAMMATES_EXPLORE,
    INTERCOM_TICKETS_EXPLORE,
} from './model';

const build = (definition: LiveExploreDefinition) =>
    buildLiveExplore({
        definition,
        exploreName: `intercom_${definition.name}`,
        label: 'Intercom',
        connectionUuid: 'connection-uuid',
        integration: ApiConnectorType.INTERCOM,
        baseVersion: 1,
        capabilities: intercomIntegration.query.capabilities,
        warehouseSqlBuilder: warehouseSqlBuilderFromType(
            SupportedDbtAdapter.DUCKDB,
        ),
    });

const CONVERSATIONS = build(INTERCOM_CONVERSATIONS_EXPLORE);
const TICKETS = build(INTERCOM_TICKETS_EXPLORE);
const CONTACTS = build(INTERCOM_CONTACTS_EXPLORE);
const TEAMMATES = build(INTERCOM_TEAMMATES_EXPLORE);

const rule = (
    fieldId: string,
    operator: FilterOperator,
    values: unknown[],
    settings?: FilterRule['settings'],
): FilterRule => ({
    id: `${fieldId}-${operator}-${values.join(',')}`,
    target: { fieldId },
    operator,
    values,
    ...(settings ? { settings } : {}),
});

const query = (
    exploreName: string,
    overrides: Partial<MetricQuery> = {},
): MetricQuery => ({
    exploreName,
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    limit: 100,
    tableCalculations: [],
    ...overrides,
});

const filters = (...rules: FilterRule[]): MetricQuery['filters'] => ({
    dimensions: { id: 'root', and: rules },
});

const compile = (explore: typeof CONVERSATIONS, metricQuery: MetricQuery) => {
    const { query: request, localSorts } = compileIntercomQuery({
        explore,
        metricQuery,
        today: '2026-11-17',
    });
    return { request: JSON.parse(request), localSorts };
};

const conversation = (name: string) => `intercom_conversations_${name}`;
const ticket = (name: string) => `intercom_tickets_${name}`;
const contact = (name: string) => `intercom_contacts_${name}`;

const unix = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`) / 1000;

/** The 30 UTC days before today, as Intercom's [start, end) pair. */
const LAST_30_DAYS = [
    { field: 'created_at', operator: '>=', value: unix('2026-10-18') },
    { field: 'created_at', operator: '<', value: unix('2026-11-17') },
];

describe('compileIntercomQuery', () => {
    it('searches the last 30 days of conversations by default, newest first', () => {
        expect(
            compile(
                CONVERSATIONS,
                query('intercom_conversations', {
                    dimensions: [
                        conversation('state'),
                        conversation('time_to_admin_reply_minutes'),
                    ],
                }),
            ),
        ).toEqual({
            request: {
                kind: 'conversations',
                filters: LAST_30_DAYS,
                columns: ['state', 'time_to_admin_reply_minutes'],
                sort: { field: 'created_at', order: 'descending' },
            },
            localSorts: [],
        });
    });

    it('turns a Created filter into whole UTC days', () => {
        const { request } = compile(
            CONVERSATIONS,
            query('intercom_conversations', {
                dimensions: [conversation('id')],
                filters: filters(
                    rule(
                        conversation('created_at'),
                        FilterOperator.IN_BETWEEN,
                        ['2026-09-01', '2026-09-30'],
                    ),
                ),
            }),
        );
        expect(request.filters).toEqual([
            { field: 'created_at', operator: '>=', value: unix('2026-09-01') },
            { field: 'created_at', operator: '<', value: unix('2026-10-01') },
        ]);
    });

    it('reads "in the past" against today in UTC', () => {
        const { request } = compile(
            CONVERSATIONS,
            query('intercom_conversations', {
                dimensions: [conversation('id')],
                filters: filters(
                    rule(
                        conversation('created_at'),
                        FilterOperator.IN_THE_PAST,
                        [7],
                        { unitOfTime: UnitOfTime.days, completed: false },
                    ),
                ),
            }),
        );
        expect(request.filters[0].value).toBeLessThan(unix('2026-11-17'));
        expect(request.filters[1]).toEqual({
            field: 'created_at',
            operator: '<',
            value: unix('2026-11-18'),
        });
    });

    it('pushes statistics, rating, Fin and assignee filters into the search', () => {
        const { request } = compile(
            CONVERSATIONS,
            query('intercom_conversations', {
                dimensions: [conversation('id')],
                filters: filters(
                    rule(conversation('state'), FilterOperator.EQUALS, [
                        'open',
                        'snoozed',
                    ]),
                    rule(conversation('source_type'), FilterOperator.EQUALS, [
                        'email',
                    ]),
                    rule(
                        conversation('time_to_admin_reply_minutes'),
                        FilterOperator.GREATER_THAN,
                        [30],
                    ),
                    rule(
                        conversation('rating'),
                        FilterOperator.LESS_THAN_OR_EQUAL,
                        [2],
                    ),
                    rule(
                        conversation('ai_agent_participated'),
                        FilterOperator.EQUALS,
                        [true],
                    ),
                    rule(
                        conversation('team_assignee_id'),
                        FilterOperator.NOT_EQUALS,
                        ['42'],
                    ),
                    rule(conversation('tag_ids'), FilterOperator.EQUALS, [
                        '7',
                        '8',
                    ]),
                    rule(
                        conversation('last_closed_at'),
                        FilterOperator.IN_BETWEEN,
                        ['2026-11-01', '2026-11-07'],
                    ),
                ),
            }),
        );
        expect(request.filters.slice(2)).toEqual([
            { field: 'state', operator: 'IN', value: ['open', 'snoozed'] },
            { field: 'source.type', operator: '=', value: 'email' },
            {
                field: 'statistics.time_to_admin_reply',
                operator: '>',
                value: 1_800,
            },
            { field: 'conversation_rating.score', operator: '<=', value: 2 },
            { field: 'ai_agent_participated', operator: '=', value: true },
            { field: 'team_assignee_id', operator: '!=', value: 42 },
            { field: 'tag_ids', operator: 'IN', value: ['7', '8'] },
            {
                field: 'statistics.last_close_at',
                operator: '>=',
                value: unix('2026-11-01'),
            },
            {
                field: 'statistics.last_close_at',
                operator: '<',
                value: unix('2026-11-08'),
            },
        ]);
    });

    it('splits lists past 15 values, as Intercom takes no more in one', () => {
        const ids = Array.from({ length: 20 }, (_, index) => String(index + 1));
        const { request } = compile(
            CONVERSATIONS,
            query('intercom_conversations', {
                dimensions: [conversation('id')],
                filters: filters(
                    rule(conversation('id'), FilterOperator.EQUALS, ids),
                    rule(conversation('state'), FilterOperator.NOT_EQUALS, ids),
                ),
            }),
        );
        expect(request.filters.slice(2)).toEqual([
            {
                operator: 'OR',
                value: [
                    { field: 'id', operator: 'IN', value: ids.slice(0, 15) },
                    { field: 'id', operator: 'IN', value: ids.slice(15) },
                ],
            },
            { field: 'state', operator: 'NIN', value: ids.slice(0, 15) },
            { field: 'state', operator: 'NIN', value: ids.slice(15) },
        ]);
        expect(() =>
            parseLiveRequest(intercomIntegration, JSON.stringify(request)),
        ).not.toThrow();
    });

    it('sends name filters as lists, to be turned into IDs before the search', () => {
        const { request } = compile(
            CONVERSATIONS,
            query('intercom_conversations', {
                dimensions: [conversation('id')],
                filters: filters(
                    rule(
                        conversation('team_assignee_name'),
                        FilterOperator.EQUALS,
                        ['Billing'],
                    ),
                    rule(
                        conversation('last_closed_by_name'),
                        FilterOperator.NOT_EQUALS,
                        ['Ada'],
                    ),
                ),
            }),
        );
        expect(request.filters.slice(2)).toEqual([
            { field: 'team_assignee_name', operator: 'IN', value: ['Billing'] },
            { field: 'last_closed_by_name', operator: 'NIN', value: ['Ada'] },
        ]);
    });

    it('sorts by a field Intercom sorts by, and leaves any other order to us', () => {
        expect(
            compile(
                CONVERSATIONS,
                query('intercom_conversations', {
                    dimensions: [conversation('waiting_since')],
                    sorts: [
                        {
                            fieldId: conversation('waiting_since'),
                            descending: false,
                        },
                    ],
                }),
            ).request.sort,
        ).toEqual({ field: 'waiting_since', order: 'ascending' });

        const sorts = [{ fieldId: conversation('rating'), descending: true }];
        const result = compile(
            CONVERSATIONS,
            query('intercom_conversations', {
                dimensions: [conversation('rating')],
                sorts,
            }),
        );
        expect(result.request.sort).toBeUndefined();
        expect(result.localSorts).toEqual(sorts);
    });

    it('searches ticket titles by part and categories by the value search takes', () => {
        const { request } = compile(
            TICKETS,
            query('intercom_tickets', {
                dimensions: [ticket('category')],
                filters: filters(
                    rule(ticket('title'), FilterOperator.INCLUDE, [
                        'refund',
                        'invoice',
                    ]),
                    rule(ticket('category'), FilterOperator.EQUALS, ['task']),
                    rule(ticket('open'), FilterOperator.EQUALS, [false]),
                ),
            }),
        );
        expect(request).toEqual({
            kind: 'tickets',
            filters: [
                ...LAST_30_DAYS,
                {
                    operator: 'OR',
                    value: [
                        { field: 'title', operator: '~', value: 'refund' },
                        { field: 'title', operator: '~', value: 'invoice' },
                    ],
                },
                { field: 'category', operator: '=', value: 'task' },
                { field: 'open', operator: '=', value: false },
            ],
            columns: ['category'],
            sort: { field: 'created_at', order: 'descending' },
        });
    });

    it('searches contacts without a date range, filtering any date', () => {
        expect(
            compile(
                CONTACTS,
                query('intercom_contacts', {
                    dimensions: [contact('created_at_week'), contact('role')],
                    filters: filters(
                        rule(contact('role'), FilterOperator.EQUALS, ['lead']),
                        rule(contact('created_at'), FilterOperator.IN_BETWEEN, [
                            '2026-10-01',
                            '2026-10-31',
                        ]),
                    ),
                }),
            ).request,
        ).toEqual({
            kind: 'contacts',
            filters: [
                { field: 'role', operator: '=', value: 'lead' },
                {
                    field: 'created_at',
                    operator: '>=',
                    value: unix('2026-10-01'),
                },
                {
                    field: 'created_at',
                    operator: '<',
                    value: unix('2026-11-01'),
                },
            ],
            columns: ['created_at_week', 'role'],
        });
    });

    it('lists teammates whole', () => {
        expect(
            compile(
                TEAMMATES,
                query('intercom_teammates', {
                    dimensions: ['intercom_teammates_name'],
                }),
            ).request,
        ).toEqual({ kind: 'teammates', filters: [], columns: ['name'] });
    });

    it('refuses filters Intercom search cannot apply before compiling', () => {
        const issues = getApiSourceQueryIssues(
            CONVERSATIONS.apiSource!,
            query('intercom_conversations', {
                dimensions: [conversation('id')],
                filters: filters(
                    rule(conversation('sla_status'), FilterOperator.EQUALS, [
                        'missed',
                    ]),
                ),
            }),
        );
        expect(issues.length).toBeGreaterThan(0);
    });
});
