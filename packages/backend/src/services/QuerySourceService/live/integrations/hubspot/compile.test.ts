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
import { HUBSPOT_MAX_ROWS } from './api';
import { compileHubspotQuery } from './compile';
import { HUBSPOT_EXPLORES } from './explores';
import { HUBSPOT_DEAL_PROPERTIES } from './hubspot.fixtures';
import {
    isInternalHubspotField,
    withHubspotPropertyFields,
} from './scanFields';

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
            'dealstage_label',
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
            'The Deal Stage property in HubSpot.',
        );
        expect(byName.dealstage.aiHint).toBe(
            "Values are HubSpot's internal option names: appointmentscheduled (Appointment Scheduled), closedwon (Closed Won).",
        );
        expect(byName.deal_tags.aiHint).toContain('semicolons');
        expect(byName.dealname.description).toBe(
            'The name given to this deal.',
        );
        expect(byName.dealname.aiHint).toBe(
            "Text 'contains' matches whole words or part of one word.",
        );
        expect(byName.amount.aiHint).toBeUndefined();
        expect(byName.property_count.apiName).toBe('count');
    });

    it('adds a label field next to a dropdown whose labels differ from its values', () => {
        const byName = Object.fromEntries(
            DEFINITION.dimensions.map((dimension) => [
                dimension.name,
                dimension,
            ]),
        );
        expect(byName.dealstage).toMatchObject({
            apiName: 'dealstage',
            label: 'Deal Stage (internal value)',
        });
        expect(byName.dealstage_label).toMatchObject({
            apiName: 'dealstage:label',
            label: 'Deal Stage',
            type: 'string',
            valueLabels: {
                appointmentscheduled: 'Appointment Scheduled',
                closedwon: 'Closed Won',
            },
        });
        expect(byName.dealstage_label.description).toBe(
            "Deal Stage as HubSpot shows it, using the option's label rather than its internal value.",
        );
        expect(byName.dealstage_label.aiHint).toContain(
            'Filter with these labels: Appointment Scheduled, Closed Won.',
        );
        // No options, so nothing to label
        expect(byName.deal_tags_label).toBeUndefined();
        expect(
            DEALS.apiSource?.fields[field('dealstage_label')].valueLabels,
        ).toEqual(byName.dealstage_label.valueLabels);
    });

    it('names built-in fields as HubSpot does', () => {
        expect(DEALS_EXPLORE.dimensions.map(({ label }) => label)).toEqual([
            'Record ID',
            'Create Date',
            'Last Modified Date',
        ]);
    });

    it('keeps most hs_ properties out of the default list', () => {
        expect(isInternalHubspotField('hs_pipeline_stage:label')).toBe(false);
        expect(isInternalHubspotField('hs_secret_thing:label')).toBe(true);
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
            ['pipeline_stages', 'Pipeline stages'],
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
        }).dimensions.filter(({ name }) => name === 'hs_pipeline_stage');
        expect(stage.aiHint).toContain('1 (Stage 1)');
        expect(stage.aiHint).toContain('20 (Stage 20)');
        expect(stage.aiHint).not.toContain('more');
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

describe('compileHubspotQuery label fields', () => {
    it('reads the property with its labels', () => {
        expect(
            compile(
                query({
                    dimensions: [field('dealstage'), field('dealstage_label')],
                }),
            ).columns,
        ).toEqual([
            { name: 'dealstage', type: 'string' },
            {
                name: 'dealstage:label',
                type: 'string',
                labels: {
                    appointmentscheduled: 'Appointment Scheduled',
                    closedwon: 'Closed Won',
                },
            },
        ]);
    });

    it('filters by label as the internal value, keeping values it doesn’t know', () => {
        expect(
            compile(
                query(
                    filtered(
                        rule('dealstage_label', FilterOperator.EQUALS, [
                            'closed won',
                            'appointmentscheduled',
                        ]),
                    ),
                ),
            ).filters,
        ).toEqual([
            {
                propertyName: 'dealstage',
                operator: 'IN',
                values: ['closedwon', 'appointmentscheduled'],
            },
        ]);
    });

    it('sorts labels on our side, since HubSpot sorts internal values', () => {
        const compiled = compileHubspotQuery({
            explore: DEALS,
            metricQuery: query({
                dimensions: [field('dealstage_label')],
                sorts: [
                    { fieldId: field('dealstage_label'), descending: false },
                ],
            }),
            today: '2026-11-19',
        });
        expect(JSON.parse(compiled.query).sort).toBeUndefined();
        expect(compiled.localSorts).toEqual([
            { fieldId: field('dealstage_label'), descending: false },
        ]);
    });
});

describe('compileHubspotQuery pipeline stages', () => {
    const PIPELINES = buildLiveExplore({
        definition: HUBSPOT_EXPLORES.find(
            ({ name }) => name === 'pipeline_stages',
        )!,
        exploreName: 'hubspot_pipeline_stages',
        label: 'HubSpot pipeline stages',
        connectionUuid: 'connection-uuid',
        integration: ApiConnectorType.HUBSPOT,
        baseVersion: 1,
        capabilities: hubspotIntegration.capabilities,
        warehouseSqlBuilder: warehouseSqlBuilderFromType(
            SupportedDbtAdapter.DUCKDB,
        ),
    });
    const stageField = (name: string) => `hubspot_pipeline_stages_${name}`;
    const compileStages = (overrides: Partial<MetricQuery>) =>
        compileHubspotQuery({
            explore: PIPELINES,
            metricQuery: {
                ...query(),
                exploreName: PIPELINES.name,
                dimensions: [
                    stageField('stage_id'),
                    stageField('stage_label'),
                    stageField('probability'),
                ],
                ...overrides,
            },
            today: '2026-11-19',
        });
    const objectRule = (operator: FilterOperator, values: string[]) => ({
        filters: {
            dimensions: {
                id: 'root',
                and: [
                    {
                        id: 'object',
                        target: { fieldId: stageField('object_type') },
                        operator,
                        values,
                    },
                ],
            },
        },
    });

    it('reads both objects’ pipelines, sorting here', () => {
        const compiled = compileStages({
            sorts: [{ fieldId: stageField('stage_label'), descending: true }],
        });
        expect(JSON.parse(compiled.query)).toEqual({
            kind: 'pipeline_stages',
            objects: ['deals', 'tickets'],
            columns: [
                { name: 'stageId', type: 'string' },
                { name: 'stageLabel', type: 'string' },
                { name: 'probability', type: 'number' },
            ],
        });
        expect(compiled.localSorts).toEqual([
            { fieldId: stageField('stage_label'), descending: true },
        ]);
    });

    it('reads only the objects an Object filter keeps', () => {
        expect(
            JSON.parse(
                compileStages(objectRule(FilterOperator.EQUALS, ['tickets']))
                    .query,
            ).objects,
        ).toEqual(['tickets']);
        expect(
            JSON.parse(
                compileStages(
                    objectRule(FilterOperator.NOT_EQUALS, ['tickets']),
                ).query,
            ).objects,
        ).toEqual(['deals']);
        expect(
            JSON.parse(
                compileStages(objectRule(FilterOperator.EQUALS, ['Tickets']))
                    .query,
            ).objects,
        ).toEqual(['tickets']);
        expect(() =>
            compileStages(objectRule(FilterOperator.EQUALS, ['contacts'])),
        ).toThrow('leave no pipelines');
    });

    it('lets the shared check refuse filters on other fields', () => {
        const issues = getApiSourceQueryIssues(
            PIPELINES.apiSource!,
            {
                ...query(),
                exploreName: PIPELINES.name,
                dimensions: [stageField('stage_label')],
                filters: {
                    dimensions: {
                        id: 'root',
                        and: [
                            {
                                id: 'stage',
                                target: { fieldId: stageField('stage_label') },
                                operator: FilterOperator.EQUALS,
                                values: ['Closed Won'],
                            },
                        ],
                    },
                },
            },
            { itemsMap: getItemMap(PIPELINES) },
        );
        expect(issues.length).toBeGreaterThan(0);
    });
});
