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
import { salesforceIntegration } from '.';
import { buildLiveExplore } from '../../explores/definition';
import { compileSalesforceQuery } from './compile';
import {
    isInternalSalesforceField,
    SALESFORCE_RECORDS_EXPLORE,
    withSalesforceFields,
} from './explores';
import { OPPORTUNITY_DESCRIBE } from './salesforce.fixtures';
import {
    salesforceRequestSchema,
    toSoql,
    type SalesforceRequest,
} from './soql';

const DEFINITION = withSalesforceFields(
    SALESFORCE_RECORDS_EXPLORE,
    OPPORTUNITY_DESCRIBE,
);

const OPPORTUNITIES = buildLiveExplore({
    definition: DEFINITION,
    exploreName: 'salesforce_records',
    label: 'Opportunities',
    connectionUuid: 'connection-uuid',
    integration: ApiConnectorType.SALESFORCE,
    baseVersion: 1,
    capabilities: salesforceIntegration.capabilities,
    warehouseSqlBuilder: warehouseSqlBuilderFromType(
        SupportedDbtAdapter.DUCKDB,
    ),
});

const field = (name: string) => `salesforce_records_${name}`;

const rule = (
    name: string,
    operator: FilterOperator,
    values: unknown[] = [],
    settings?: FilterRule['settings'],
): FilterRule => ({
    id: `${name}-${operator}-${values.join(',')}`,
    target: { fieldId: field(name) },
    operator,
    values,
    ...(settings ? { settings } : {}),
});

const query = (overrides: Partial<MetricQuery> = {}): MetricQuery => ({
    exploreName: OPPORTUNITIES.name,
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
    ...overrides,
});

const where = (...rules: FilterRule[]) => ({
    dimensions: { id: 'root', and: rules },
});

const compileRequest = (metricQuery: MetricQuery): SalesforceRequest =>
    salesforceRequestSchema.parse(
        JSON.parse(
            compileSalesforceQuery({
                explore: OPPORTUNITIES,
                metricQuery,
                today: '2026-11-19',
            }).query,
        ),
    );

/** The SOQL a query sends, with the row limit run would add. */
const soqlOf = (metricQuery: MetricQuery, rowLimit = 501) =>
    toSoql(compileRequest(metricQuery), 'Opportunity', rowLimit).soql;

const issuesOf = (metricQuery: MetricQuery) =>
    getApiSourceQueryIssues(OPPORTUNITIES.apiSource!, metricQuery, {
        itemsMap: getItemMap(OPPORTUNITIES),
    });

describe('Salesforce fields', () => {
    it('adds groupable fields as dimensions and numbers as totals', () => {
        const dimensions = DEFINITION.dimensions.map(({ name }) => name);
        expect(dimensions).toEqual(
            expect.arrayContaining([
                'stagename',
                'closedate',
                'closedate__month',
                'closedate__quarter',
                'closedate__year',
                'accountid',
                'account__name',
                'owner__name',
                'region__c',
                'iswon',
                'lastmodifieddate',
            ]),
        );
        // Decimals, long text and hidden fields can't be grouped, so they
        // aren't dimensions; built-in fields aren't added twice
        expect(dimensions).not.toEqual(expect.arrayContaining(['amount']));
        expect(dimensions).not.toContain('description');
        expect(dimensions).not.toContain('legacy__c');
        expect(dimensions).not.toContain('createddate');
        expect(DEFINITION.metrics.map(({ name }) => name)).toEqual([
            'count',
            'amount__sum',
            'amount__avg',
            'amount__min',
            'amount__max',
            'probability__avg',
            'probability__min',
            'probability__max',
            'seats__c__sum',
            'seats__c__avg',
            'seats__c__min',
            'seats__c__max',
        ]);
    });

    it('lists picklist values and labels for agents, active ones only', () => {
        const stage = DEFINITION.dimensions.find(
            ({ name }) => name === 'stagename',
        );
        expect(stage?.description).toContain(
            'Values: Prospecting, Closed Won, Closed Lost.',
        );
        const region = DEFINITION.dimensions.find(
            ({ name }) => name === 'region__c',
        );
        expect(region?.description).toBe(
            'Sales region that owns the deal. Values: EMEA (Europe), AMER.',
        );
    });

    it('reads a datetime by day, and every date by month, quarter and year', () => {
        const apiNames = Object.fromEntries(
            DEFINITION.dimensions.map(({ name, apiName }) => [name, apiName]),
        );
        expect(apiNames).toMatchObject({
            closedate: 'CloseDate',
            closedate__month: 'CALENDAR_MONTH(CloseDate)',
            lastmodifieddate: 'DAY_ONLY(LastModifiedDate)',
            lastmodifieddate__year: 'CALENDAR_YEAR(LastModifiedDate)',
            owner__name: 'Owner.Name',
        });
    });

    it('starts system fields and minimums and maximums hidden', () => {
        expect(isInternalSalesforceField('SystemModstamp')).toBe(true);
        expect(isInternalSalesforceField('CALENDAR_YEAR(SystemModstamp)')).toBe(
            true,
        );
        expect(isInternalSalesforceField('MAX(Amount)')).toBe(true);
        expect(isInternalSalesforceField('SUM(Amount)')).toBe(false);
        expect(isInternalSalesforceField('StageName')).toBe(false);
    });

    it('keeps the built-in fields when the describe is unreadable', () => {
        expect(withSalesforceFields(SALESFORCE_RECORDS_EXPLORE, {})).toBe(
            SALESFORCE_RECORDS_EXPLORE,
        );
    });
});

describe('compileSalesforceQuery: totals computed by Salesforce in one query', () => {
    it('counts matching records', () => {
        expect(soqlOf(query({ metrics: [field('count')] }), 2)).toBe(
            'SELECT COUNT(Id) c0 FROM Opportunity',
        );
    });

    it('groups by a field and a month, totals, filters and sorts on Salesforce', () => {
        expect(
            soqlOf(
                query({
                    dimensions: [field('stagename'), field('closedate__month')],
                    metrics: [field('amount__sum'), field('count')],
                    filters: {
                        ...where(
                            rule(
                                'closedate',
                                FilterOperator.IN_THE_CURRENT,
                                [1],
                                {
                                    unitOfTime: UnitOfTime.years,
                                },
                            ),
                            rule('iswon', FilterOperator.EQUALS, [true]),
                        ),
                        metrics: {
                            id: 'metrics',
                            and: [
                                rule(
                                    'amount__sum',
                                    FilterOperator.GREATER_THAN,
                                    [10000],
                                ),
                            ],
                        },
                    },
                    sorts: [
                        { fieldId: field('amount__sum'), descending: true },
                        {
                            fieldId: field('closedate__month'),
                            descending: false,
                        },
                    ],
                    limit: 10,
                }),
                11,
            ),
        ).toBe(
            'SELECT StageName c0, CALENDAR_YEAR(CloseDate) c1y, CALENDAR_MONTH(CloseDate) c1m, SUM(Amount) c2, COUNT(Id) c3 FROM Opportunity' +
                ' WHERE ((CloseDate >= 2026-01-01 AND CloseDate < 2027-01-01) AND IsWon = TRUE)' +
                ' GROUP BY StageName, CALENDAR_YEAR(CloseDate), CALENDAR_MONTH(CloseDate)' +
                ' HAVING SUM(Amount) > 10000' +
                ' ORDER BY SUM(Amount) DESC NULLS LAST, CALENDAR_YEAR(CloseDate) ASC NULLS LAST, CALENDAR_MONTH(CloseDate) ASC NULLS LAST' +
                ' LIMIT 11',
        );
    });

    it('groups by a lookup name and a datetime day', () => {
        expect(
            soqlOf(
                query({
                    dimensions: [field('owner__name'), field('created_at_day')],
                    metrics: [field('count')],
                }),
            ),
        ).toBe(
            'SELECT Owner.Name c0, DAY_ONLY(CreatedDate) c1, COUNT(Id) c2 FROM Opportunity GROUP BY Owner.Name, DAY_ONLY(CreatedDate) LIMIT 501',
        );
    });

    it('pushes OR and nested groups into WHERE', () => {
        expect(
            soqlOf(
                query({
                    metrics: [field('count')],
                    filters: {
                        dimensions: {
                            id: 'root',
                            or: [
                                rule('stagename', FilterOperator.EQUALS, [
                                    'Closed Won',
                                    'Closed Lost',
                                ]),
                                {
                                    id: 'nested',
                                    and: [
                                        rule('name', FilterOperator.INCLUDE, [
                                            'renewal',
                                        ]),
                                        rule('region__c', FilterOperator.NULL),
                                    ],
                                },
                            ],
                        },
                    },
                }),
            ),
        ).toBe(
            "SELECT COUNT(Id) c0 FROM Opportunity WHERE (StageName IN ('Closed Won', 'Closed Lost') OR (Name LIKE '%renewal%' AND Region__c = null))",
        );
    });

    it('filters a datetime day by UTC date and time bounds', () => {
        expect(
            soqlOf(
                query({
                    metrics: [field('count')],
                    filters: where(
                        rule(
                            'created_at_day',
                            FilterOperator.IN_THE_PAST,
                            [7],
                            {
                                unitOfTime: UnitOfTime.days,
                                completed: true,
                            },
                        ),
                    ),
                }),
            ),
        ).toBe(
            'SELECT COUNT(Id) c0 FROM Opportunity WHERE (CreatedDate >= 2026-11-12T00:00:00Z AND CreatedDate < 2026-11-19T00:00:00Z)',
        );
    });

    it('leaves "after" open, since close dates can be in the future', () => {
        expect(
            soqlOf(
                query({
                    metrics: [field('count')],
                    filters: where(
                        rule(
                            'closedate',
                            FilterOperator.GREATER_THAN_OR_EQUAL,
                            ['2026-11-19'],
                        ),
                    ),
                }),
            ),
        ).toBe(
            'SELECT COUNT(Id) c0 FROM Opportunity WHERE CloseDate >= 2026-11-19',
        );
    });

    it('refuses grouping by a date and time before any call', () => {
        expect(() =>
            compileRequest(
                query({
                    dimensions: [field('created_at')],
                    metrics: [field('count')],
                }),
            ),
        ).toThrow(/a date and time\. Use its day, month, quarter or year/);
    });

    it('refuses a metric filter without a dimension before any call', () => {
        expect(() =>
            compileRequest(
                query({
                    metrics: [field('count')],
                    filters: {
                        metrics: {
                            id: 'metrics',
                            and: [
                                rule('count', FilterOperator.GREATER_THAN, [5]),
                            ],
                        },
                    },
                }),
            ),
        ).toThrow(ParameterError);
    });

    it('refuses filtering by a month before the shared check passes it', () => {
        expect(
            issuesOf(
                query({
                    metrics: [field('count')],
                    filters: where(
                        rule('closedate__month', FilterOperator.EQUALS, [
                            '2026-01-01',
                        ]),
                    ),
                }),
            ).map(({ code }) => code),
        ).toEqual(['live_source.refused.filter_operator']);
    });
});

describe('compileSalesforceQuery: record lists', () => {
    it('selects the fields, reads dates at a grain whole, and sorts on Salesforce', () => {
        expect(
            soqlOf(
                query({
                    dimensions: [
                        field('name'),
                        field('owner__name'),
                        field('closedate__quarter'),
                        field('created_at'),
                    ],
                    sorts: [
                        {
                            fieldId: field('closedate__quarter'),
                            descending: true,
                        },
                    ],
                }),
            ),
        ).toBe(
            'SELECT Name, Owner.Name, CloseDate, CreatedDate FROM Opportunity ORDER BY CloseDate DESC NULLS LAST LIMIT 501',
        );
    });
});

describe('SOQL injection', () => {
    const named = (value: string, operator = FilterOperator.EQUALS) =>
        soqlOf(
            query({
                dimensions: [field('name')],
                filters: where(rule('name', operator, [value])),
            }),
        );

    it('escapes quotes and backslashes in values', () => {
        expect(named("x' OR Name != '")).toBe(
            "SELECT Name FROM Opportunity WHERE Name = 'x\\' OR Name != \\'' LIMIT 501",
        );
        expect(named('a\\')).toContain("Name = 'a\\\\'");
        expect(named('line\nbreak')).toContain("Name = 'line\\nbreak'");
    });

    it('makes LIKE wildcards in a value match themselves', () => {
        expect(named("50%_off'", FilterOperator.INCLUDE)).toContain(
            "Name LIKE '%50\\%\\_off\\'%'",
        );
        expect(named('drop', FilterOperator.NOT_INCLUDE)).toContain(
            "(NOT Name LIKE '%drop%')",
        );
    });

    it('refuses control characters', () => {
        expect(() => named('a\u0000b')).toThrow(ParameterError);
    });

    it('refuses numbers, dates and booleans that are not one', () => {
        const base = {
            kind: 'records' as const,
            columns: [{ name: 'Name', type: 'string' as const }],
            having: null,
            sorts: [],
        };
        const condition = (valueType: string, value: unknown) => ({
            ...base,
            where: {
                field: 'Amount',
                operator: 'eq',
                values: [value],
                valueType,
            },
        });
        for (const [valueType, value] of [
            ['number', '1 OR Name != null'],
            ['number', '1e9'],
            ['date', '2026-01-01 OR Id != null'],
            ['datetime', '2026-01-01'],
            ['boolean', 'TRUE OR'],
        ] as const) {
            expect(() =>
                toSoql(
                    salesforceRequestSchema.parse(condition(valueType, value)),
                    'Opportunity',
                    1,
                ),
            ).toThrow(ParameterError);
        }
    });

    it('accepts only field API names, never SOQL, where a name goes', () => {
        const parse = (overrides: Record<string, unknown>) =>
            salesforceRequestSchema.safeParse({
                kind: 'records',
                columns: [{ name: 'Name', type: 'string' }],
                where: null,
                having: null,
                sorts: [],
                ...overrides,
            }).success;
        expect(
            parse({
                columns: [{ name: 'Name FROM User --', type: 'string' }],
            }),
        ).toBe(false);
        expect(
            parse({
                columns: [
                    { name: 'Id, (SELECT Id FROM Contacts)', type: 'string' },
                ],
            }),
        ).toBe(false);
        expect(
            parse({
                where: {
                    field: 'Name = null OR Id',
                    operator: 'eq',
                    values: ['x'],
                    valueType: 'string',
                },
            }),
        ).toBe(false);
        expect(parse({ sorts: [{ name: 'Name', descending: true }] })).toBe(
            true,
        );
        expect(parse({ sorts: [{ name: 'Amount', descending: true }] })).toBe(
            false,
        );
    });
});
