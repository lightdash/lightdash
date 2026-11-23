import {
    ApiConnectorType,
    FilterOperator,
    getApiSourceQueryIssues,
    getItemMap,
    ParameterError,
    SupportedDbtAdapter,
    UnitOfTime,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { hubspotIntegration } from '.';
import { compileLiveMetricQuery } from '../../explores/build';
import { buildLiveExplore } from '../../explores/definition';
import { compileHubspotQuery } from './compile';
import {
    HUBSPOT_EXPLORES,
    HUBSPOT_MAX_ROWS,
    isInternalHubspotField,
    withHubspotPropertyFields,
} from './explores';
import { HUBSPOT_DEAL_PROPERTIES } from './hubspot.fixtures';

const [DEALS_EXPLORE] = HUBSPOT_EXPLORES;

const DEFINITION = withHubspotPropertyFields(
    DEALS_EXPLORE,
    HUBSPOT_DEAL_PROPERTIES,
);

const DEALS = buildLiveExplore({
    definition: DEFINITION,
    exploreName: 'hubspot_deals',
    label: 'HubSpot deals',
    connectionUuid: 'connection-uuid',
    integration: ApiConnectorType.HUBSPOT,
    baseVersion: 1,
    capabilities: hubspotIntegration.capabilities,
    warehouseSqlBuilder: warehouseSqlBuilderFromType(
        SupportedDbtAdapter.DUCKDB,
    ),
});

const field = (name: string) => `hubspot_deals_${name}`;

const rule = (
    name: string,
    operator: FilterOperator,
    values: unknown[],
    settings?: FilterRule['settings'],
): FilterRule => ({
    id: `${name}-${operator}-${values.join(',')}`,
    target: { fieldId: field(name) },
    operator,
    values,
    ...(settings ? { settings } : {}),
});

const query = (overrides: Partial<MetricQuery> = {}): MetricQuery => ({
    exploreName: DEALS.name,
    dimensions: [field('dealname')],
    metrics: [],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
    ...overrides,
});

const filtered = (...rules: FilterRule[]): Partial<MetricQuery> => ({
    filters: { dimensions: { id: 'root', and: rules } },
});

const compile = (metricQuery: MetricQuery) =>
    JSON.parse(
        compileHubspotQuery({
            explore: DEALS,
            metricQuery,
            today: '2026-11-19',
        }).query,
    );

describe('HubSpot fields', () => {
    it('adds a dimension per readable property, people’s own first', () => {
        const names = DEFINITION.dimensions.map(({ name }) => name);
        expect(names).toEqual([
            'record_id',
            'created_at',
            'updated_at',
            'dealname',
            'amount',
            'dealstage',
            'closedate',
            'contract_date',
            'deal_tags',
            'hs_is_closed_won',
            // A property can't take Count's name
            'property_count',
            'hs_analytics_latest_source_data_1',
        ]);
    });

    it('types properties and lists option values for agents', () => {
        const byName = Object.fromEntries(
            DEFINITION.dimensions.map((dimension) => [
                dimension.name,
                dimension,
            ]),
        );
        expect(byName.amount.type).toBe('number');
        expect(byName.closedate.type).toBe('timestamp');
        expect(byName.contract_date.type).toBe('date');
        expect(byName.hs_is_closed_won.type).toBe('boolean');
        expect(byName.dealstage.description).toBe(
            "The Deal Stage property in HubSpot. Values are HubSpot's internal option names: appointmentscheduled (Appointment Scheduled), closedwon (Closed Won).",
        );
        expect(byName.deal_tags.description).toContain('semicolons');
        expect(byName.dealname.description).toBe(
            'The name given to this deal. Contains matches whole words or part of one word.',
        );
        expect(byName.property_count.apiName).toBe('count');
    });

    it('keeps most hs_ properties out of the default list', () => {
        expect(
            isInternalHubspotField('hs_analytics_latest_source_data_1'),
        ).toBe(true);
        expect(isInternalHubspotField('hs_is_closed_won')).toBe(false);
        expect(isInternalHubspotField('dealname')).toBe(false);
    });

    it('builds one explore per object, tickets and leads included', () => {
        expect(
            HUBSPOT_EXPLORES.map(({ name, label }) => [name, label]),
        ).toEqual([
            ['deals', 'Deals'],
            ['contacts', 'Contacts'],
            ['companies', 'Companies'],
            ['tickets', 'Tickets'],
            ['leads', 'Leads'],
        ]);
    });

    it('shows ticket pipeline and stage by default', () => {
        expect(isInternalHubspotField('hs_pipeline')).toBe(false);
        expect(isInternalHubspotField('hs_pipeline_stage')).toBe(false);
        expect(isInternalHubspotField('hs_ticket_priority')).toBe(false);
    });

    it('lists every pipeline stage with its label, past the usual cap', () => {
        const options = Array.from({ length: 20 }, (_, index) => ({
            value: `${index + 1}`,
            label: `Stage ${index + 1}`,
        }));
        const [stage] = withHubspotPropertyFields(HUBSPOT_EXPLORES[3], {
            results: [
                {
                    name: 'hs_pipeline_stage',
                    label: 'Ticket status',
                    type: 'enumeration',
                    options,
                },
            ],
        }).dimensions.slice(-1);
        expect(stage.description).toContain('1 (Stage 1)');
        expect(stage.description).toContain('20 (Stage 20)');
        expect(stage.description).not.toContain('more');
    });

    it('says why an explore is unavailable when its scan failed', () => {
        const leads = HUBSPOT_EXPLORES.find(({ name }) => name === 'leads')!;
        const definition = withHubspotPropertyFields(leads, {
            error: 'The HubSpot private app is missing a scope.',
        });
        expect(definition.dimensions).toEqual(leads.dimensions);
        expect(definition.description).toContain(
            "Unavailable: the last scan couldn't read leads. The HubSpot private app is missing a scope.",
        );
    });

    it('keeps the built-in fields when the list is unreadable', () => {
        expect(withHubspotPropertyFields(DEALS_EXPLORE, {})).toBe(
            DEALS_EXPLORE,
        );
    });
});

describe('compileHubspotQuery', () => {
    it('lists the selected properties with their types and one native sort', () => {
        expect(
            compile(
                query({
                    dimensions: [
                        field('record_id'),
                        field('dealname'),
                        field('amount'),
                        field('closedate'),
                    ],
                    sorts: [{ fieldId: field('amount'), descending: true }],
                }),
            ),
        ).toEqual({
            kind: 'records',
            object: 'deals',
            columns: [
                { name: 'id', type: 'string' },
                { name: 'dealname', type: 'string' },
                { name: 'amount', type: 'number' },
                { name: 'closedate', type: 'timestamp' },
            ],
            filters: [],
            sort: { propertyName: 'amount', direction: 'DESCENDING' },
        });
    });

    it('never sorts on our side', () => {
        const { localSorts } = compileHubspotQuery({
            explore: DEALS,
            metricQuery: query({
                sorts: [{ fieldId: field('dealname'), descending: false }],
            }),
            today: '2026-11-19',
        });
        expect(localSorts).toEqual([]);
    });

    it('refuses a second sort, which HubSpot can’t apply', () => {
        expect(() =>
            compile(
                query({
                    sorts: [
                        { fieldId: field('amount'), descending: true },
                        { fieldId: field('dealname'), descending: false },
                    ],
                }),
            ),
        ).toThrow(ParameterError);
    });

    it('turns text, choice, number and boolean filters into one group', () => {
        expect(
            compile(
                query(
                    filtered(
                        rule('dealname', FilterOperator.INCLUDE, ['renewal']),
                        rule('dealstage', FilterOperator.EQUALS, [
                            'closedwon',
                            'AppointmentScheduled',
                        ]),
                        rule('dealstage', FilterOperator.NOT_EQUALS, ['lost']),
                        rule('amount', FilterOperator.IN_BETWEEN, [100, 5000]),
                        rule('hs_is_closed_won', FilterOperator.EQUALS, [true]),
                    ),
                ),
            ).filters,
        ).toEqual([
            {
                propertyName: 'dealname',
                operator: 'CONTAINS_TOKEN',
                value: '*renewal*',
            },
            {
                propertyName: 'dealstage',
                operator: 'IN',
                values: ['closedwon', 'appointmentscheduled'],
            },
            { propertyName: 'dealstage', operator: 'NEQ', value: 'lost' },
            {
                propertyName: 'amount',
                operator: 'BETWEEN',
                value: '100',
                highValue: '5000',
            },
            { propertyName: 'hs_is_closed_won', operator: 'EQ', value: 'true' },
        ]);
    });

    it('turns date filters into epoch milliseconds over whole UTC days', () => {
        const start = Date.parse('2026-10-20T00:00:00Z');
        const end = Date.parse('2026-11-20T00:00:00Z');
        expect(
            compile(
                query(
                    filtered(
                        rule('closedate', FilterOperator.IN_THE_PAST, [30], {
                            unitOfTime: UnitOfTime.days,
                        }),
                    ),
                ),
            ).filters,
        ).toEqual([
            {
                propertyName: 'closedate',
                operator: 'GTE',
                value: String(start),
            },
            { propertyName: 'closedate', operator: 'LT', value: String(end) },
        ]);
        expect(
            compile(
                query(
                    filtered(
                        rule('created_at', FilterOperator.GREATER_THAN, [
                            '2026-01-01',
                        ]),
                    ),
                ),
            ).filters,
        ).toHaveLength(1);
    });

    it('reaches into the future for "in the next", such as close dates', () => {
        const next = (count: number, settings: Record<string, unknown>) =>
            compile(
                query(
                    filtered(
                        rule(
                            'closedate',
                            FilterOperator.IN_THE_NEXT,
                            [count],
                            settings,
                        ),
                    ),
                ),
            ).filters;
        expect(next(90, { unitOfTime: UnitOfTime.days })).toEqual([
            {
                propertyName: 'closedate',
                operator: 'GTE',
                value: String(Date.parse('2026-11-19T00:00:00Z')),
            },
            {
                propertyName: 'closedate',
                operator: 'LT',
                value: String(Date.parse('2027-02-18T00:00:00Z')),
            },
        ]);
        expect(next(1, { unitOfTime: UnitOfTime.quarters })[1]).toEqual({
            propertyName: 'closedate',
            operator: 'LT',
            value: String(Date.parse('2027-02-20T00:00:00Z')),
        });
        expect(() =>
            next(2, { unitOfTime: UnitOfTime.weeks, completed: true }),
        ).toThrow(ParameterError);
        expect(() => next(3, { unitOfTime: UnitOfTime.hours })).toThrow(
            ParameterError,
        );
    });

    it('reads "in the current" to the end of the period, future days included', () => {
        const current = (unitOfTime: UnitOfTime) =>
            compile(
                query(
                    filtered(
                        rule('closedate', FilterOperator.IN_THE_CURRENT, [1], {
                            unitOfTime,
                        }),
                    ),
                ),
            ).filters;
        const bound = (date: string) => String(Date.parse(`${date}T00:00:00Z`));
        expect(current(UnitOfTime.months)).toEqual([
            {
                propertyName: 'closedate',
                operator: 'GTE',
                value: bound('2026-11-01'),
            },
            {
                propertyName: 'closedate',
                operator: 'LT',
                value: bound('2026-12-01'),
            },
        ]);
        expect(current(UnitOfTime.quarters)[1].value).toBe(bound('2027-01-01'));
        expect(current(UnitOfTime.weeks)[1].value).toBe(bound('2026-11-23'));
        expect(current(UnitOfTime.days)[1].value).toBe(bound('2026-11-20'));
    });

    it('says a date range counts as two of HubSpot’s six conditions', () => {
        const between = (name: string) =>
            rule(name, FilterOperator.IN_BETWEEN, ['2026-01-01', '2026-02-01']);
        expect(() =>
            compile(
                query(
                    filtered(
                        between('closedate'),
                        between('created_at'),
                        between('updated_at'),
                        rule('dealstage', FilterOperator.EQUALS, ['closedwon']),
                    ),
                ),
            ),
        ).toThrow('a date range counts as two');
    });

    it('counts from the search total, with the filters', () => {
        expect(
            compile(
                query({
                    dimensions: [],
                    metrics: [field('count')],
                    sorts: [{ fieldId: field('count'), descending: true }],
                    ...filtered(
                        rule('dealstage', FilterOperator.EQUALS, ['closedwon']),
                    ),
                }),
            ),
        ).toEqual({
            kind: 'count',
            object: 'deals',
            filters: [
                {
                    propertyName: 'dealstage',
                    operator: 'EQ',
                    value: 'closedwon',
                },
            ],
        });
    });

    it('refuses Count split by a property', () => {
        expect(() =>
            compile(
                query({
                    dimensions: [field('dealstage')],
                    metrics: [field('count')],
                }),
            ),
        ).toThrow("HubSpot search returns one total, so Count can't be split");
    });

    it('lets the shared check refuse Count by a built-in field', () => {
        const issues = getApiSourceQueryIssues(
            DEALS.apiSource!,
            query({
                dimensions: [field('created_at')],
                metrics: [field('count')],
            }),
            { itemsMap: getItemMap(DEALS) },
        );
        expect(issues.map(({ code }) => code)).toContain(
            'live_source.refused.field_combination',
        );
    });

    it('lets the shared check refuse OR filters', () => {
        const issues = getApiSourceQueryIssues(
            DEALS.apiSource!,
            query({
                filters: {
                    dimensions: {
                        id: 'root',
                        or: [
                            rule('dealname', FilterOperator.EQUALS, ['a']),
                            rule('amount', FilterOperator.EQUALS, [1]),
                        ],
                    },
                },
            }),
            { itemsMap: getItemMap(DEALS) },
        );
        expect(issues).not.toHaveLength(0);
    });

    it('asks for no more rows than the limit', () => {
        const compiled = compileLiveMetricQuery({
            explore: DEALS,
            metricQuery: query({ limit: 50 }),
            timezone: 'UTC',
            now: new Date('2026-11-19T12:00:00Z'),
        });
        expect(compiled.requestLimit).toBe(50);
        expect(compiled.requestLimit).toBeLessThan(HUBSPOT_MAX_ROWS);
    });
});
