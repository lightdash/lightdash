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
import { pylonIntegration } from '.';
import { compileLiveMetricQuery } from '../../explores/build';
import {
    buildLiveExplore,
    type NamedLiveExploreDefinition,
} from '../../explores/definition';
import { compilePylonQuery } from './compile';
import {
    PYLON_ACCOUNTS_EXPLORE,
    PYLON_CONTACTS_EXPLORE,
    PYLON_ISSUES_EXPLORE,
} from './model';
import { PYLON_MAX_QUERY_ROWS } from './run';

const build = (definition: NamedLiveExploreDefinition) =>
    buildLiveExplore({
        definition,
        exploreName: `pylon_${definition.name}`,
        label: 'Pylon',
        connectionUuid: 'connection-uuid',
        integration: ApiConnectorType.PYLON,
        baseVersion: 1,
        capabilities: pylonIntegration.query.capabilities,
        warehouseSqlBuilder: warehouseSqlBuilderFromType(
            SupportedDbtAdapter.DUCKDB,
        ),
    });

const ISSUES = build(PYLON_ISSUES_EXPLORE);
const ACCOUNTS = build(PYLON_ACCOUNTS_EXPLORE);
const CONTACTS = build(PYLON_CONTACTS_EXPLORE);

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

const compile = (explore: typeof ISSUES, metricQuery: MetricQuery) => {
    const { query: request, localSorts } = compilePylonQuery({
        explore,
        metricQuery,
        today: '2026-11-17',
    });
    return { request: JSON.parse(request), localSorts };
};

const issue = (name: string) => `pylon_issues_${name}`;
const account = (name: string) => `pylon_accounts_${name}`;
const contact = (name: string) => `pylon_contacts_${name}`;

const LAST_30_DAYS = {
    field: 'created_at',
    operator: 'time_range',
    values: ['2026-10-18T00:00:00Z', '2026-11-17T00:00:00Z'],
};

describe('compilePylonQuery issues', () => {
    it('searches the last 30 creation days, newest first, without a Created filter', () => {
        expect(
            compile(
                ISSUES,
                query('pylon_issues', {
                    dimensions: [issue('number'), issue('title')],
                }),
            ),
        ).toEqual({
            request: {
                kind: 'issues',
                filters: [LAST_30_DAYS],
                columns: ['number', 'title'],
                sort: { field: 'created_at', order: 'desc' },
            },
            localSorts: [],
        });
    });

    it('turns the Created filter into the searched range of whole UTC days', () => {
        const { request } = compile(
            ISSUES,
            query('pylon_issues', {
                dimensions: [issue('number')],
                filters: filters(
                    rule(issue('created_at'), FilterOperator.IN_BETWEEN, [
                        '2026-10-01',
                        '2026-10-31',
                    ]),
                ),
            }),
        );
        expect(request.filters).toEqual([
            {
                field: 'created_at',
                operator: 'time_range',
                values: ['2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z'],
            },
        ]);
    });

    it('maps filters to search fields and value lists', () => {
        const { request } = compile(
            ISSUES,
            query('pylon_issues', {
                dimensions: [issue('state')],
                filters: filters(
                    rule(issue('state'), FilterOperator.NOT_EQUALS, [
                        'closed',
                        'on_hold',
                    ]),
                    rule(issue('type'), FilterOperator.EQUALS, ['ticket']),
                    rule(issue('tags'), FilterOperator.EQUALS, ['billing']),
                    rule(issue('title'), FilterOperator.INCLUDE, [
                        'export',
                        'login',
                    ]),
                    rule(issue('account_name'), FilterOperator.EQUALS, [
                        'Example Co',
                    ]),
                    rule(issue('assignee_email'), FilterOperator.NULL, [true]),
                    rule(issue('touches'), FilterOperator.GREATER_THAN, [2]),
                    rule(issue('updated_at'), FilterOperator.IN_THE_PAST, [7], {
                        unitOfTime: UnitOfTime.days,
                        completed: false,
                    }),
                ),
            }),
        );
        expect(request.filters).toEqual([
            LAST_30_DAYS,
            {
                field: 'state',
                operator: 'not_in',
                values: ['closed', 'on_hold'],
            },
            { field: 'issue_type', operator: 'in', values: ['ticket'] },
            { field: 'tags', operator: 'in', values: ['billing'] },
            {
                operator: 'or',
                subfilters: [
                    {
                        field: 'subject',
                        operator: 'string_contains',
                        value: 'export',
                    },
                    {
                        field: 'subject',
                        operator: 'string_contains',
                        value: 'login',
                    },
                ],
            },
            { field: 'account_name', operator: 'in', values: ['Example Co'] },
            { field: 'assignee_id', operator: 'is_unset' },
            {
                field: 'number_of_touches',
                operator: 'greater_than',
                value: '2',
            },
            {
                field: 'updated_at',
                operator: 'time_range',
                values: ['2026-11-10T00:00:00Z', '2026-11-18T00:00:00Z'],
            },
        ]);
    });

    it('sends null checks on account and assignee, which have no values', () => {
        const { request } = compile(
            ISSUES,
            query('pylon_issues', {
                dimensions: [issue('number')],
                filters: filters(
                    rule(issue('account_id'), FilterOperator.NULL, []),
                    rule(issue('assignee_email'), FilterOperator.NOT_NULL, []),
                ),
            }),
        );
        expect(request.filters).toEqual([
            LAST_30_DAYS,
            { field: 'account_id', operator: 'is_unset' },
            { field: 'assignee_id', operator: 'is_set' },
        ]);
        expect(request.localFilters).toEqual([
            { column: 'account_id', operator: 'is_null' },
            { column: 'assignee_id', operator: 'is_not_null' },
        ]);
    });

    it('filters first response here, on the minutes the column reports', () => {
        const { request } = compile(
            ISSUES,
            query('pylon_issues', {
                dimensions: [issue('number')],
                filters: filters(
                    rule(
                        issue('first_response_minutes'),
                        FilterOperator.GREATER_THAN,
                        [90],
                    ),
                ),
            }),
        );
        expect(request.filters).toEqual([LAST_30_DAYS]);
        expect(request.localFilters).toEqual([
            {
                column: 'first_response_minutes',
                operator: 'greater_than',
                value: 90,
            },
        ]);
    });

    it('sorts by creation or update in Pylon and anything else here', () => {
        expect(
            compile(
                ISSUES,
                query('pylon_issues', {
                    dimensions: [issue('number')],
                    sorts: [
                        { fieldId: issue('updated_at'), descending: false },
                    ],
                }),
            ).request.sort,
        ).toEqual({ field: 'updated_at', order: 'asc' });

        const sorts = [{ fieldId: issue('touches'), descending: true }];
        const { request, localSorts } = compile(
            ISSUES,
            query('pylon_issues', { dimensions: [issue('number')], sorts }),
        );
        expect(request).not.toHaveProperty('sort');
        expect(localSorts).toEqual(sorts);
    });

    it('reads up to the cap when it sorts the rows here', () => {
        const metricQuery = query('pylon_issues', {
            dimensions: [issue('account_name')],
            sorts: [{ fieldId: issue('account_name'), descending: true }],
        });
        const compiled = compileLiveMetricQuery({
            explore: ISSUES,
            metricQuery,
            timezone: 'UTC',
            now: new Date('2026-11-17T12:00:00Z'),
        });
        expect(JSON.parse(compiled.query)).toMatchObject({
            columns: ['account_name'],
        });
        expect(JSON.parse(compiled.query)).not.toHaveProperty('sort');
        expect(compiled.localSorts).toEqual(metricQuery.sorts);
        expect(compiled.requestLimit).toBe(PYLON_MAX_QUERY_ROWS);
    });

    it('passes the shared check for issues filtered by state', () => {
        expect(
            getApiSourceQueryIssues(
                ISSUES.apiSource!,
                query('pylon_issues', {
                    dimensions: [issue('state')],
                    filters: filters(
                        rule(issue('state'), FilterOperator.EQUALS, [
                            'new',
                            'waiting_on_you',
                        ]),
                    ),
                }),
            ),
        ).toEqual([]);
    });

    it('refuses filters Pylon search lacks', () => {
        expect(
            getApiSourceQueryIssues(
                ISSUES.apiSource!,
                query('pylon_issues', {
                    dimensions: [issue('number')],
                    filters: filters(
                        rule(issue('link'), FilterOperator.EQUALS, ['x']),
                    ),
                }),
            ).map(({ code }) => code),
        ).toEqual(['live_source.refused.filter_operator']);
    });
});

describe('compilePylonQuery accounts and contacts', () => {
    it('searches accounts with no date range and sorts by name in Pylon', () => {
        expect(
            compile(
                ACCOUNTS,
                query('pylon_accounts', {
                    dimensions: [account('name'), account('domain')],
                    filters: filters(
                        rule(account('domain'), FilterOperator.INCLUDE, [
                            '.example',
                        ]),
                        rule(account('id'), FilterOperator.EQUALS, ['acc_1']),
                    ),
                    sorts: [{ fieldId: account('name'), descending: false }],
                }),
            ),
        ).toEqual({
            request: {
                kind: 'accounts',
                filters: [
                    {
                        field: 'domains',
                        operator: 'string_contains',
                        value: '.example',
                    },
                    { field: 'account_id', operator: 'in', values: ['acc_1'] },
                ],
                columns: ['name', 'domain'],
                sort: { field: 'name', order: 'asc' },
            },
            localSorts: [],
        });
    });

    it('sorts contacts here, since contact search has no order', () => {
        const sorts = [{ fieldId: contact('name'), descending: false }];
        const { request, localSorts } = compile(
            CONTACTS,
            query('pylon_contacts', {
                dimensions: [contact('name'), contact('account_name')],
                filters: filters(
                    rule(contact('account_name'), FilterOperator.NOT_EQUALS, [
                        'Example Co',
                    ]),
                ),
                sorts,
            }),
        );
        expect(request).toEqual({
            kind: 'contacts',
            filters: [
                {
                    field: 'account_name',
                    operator: 'not_in',
                    values: ['Example Co'],
                },
            ],
            columns: ['name', 'account_name'],
        });
        expect(localSorts).toEqual(sorts);
    });
});
