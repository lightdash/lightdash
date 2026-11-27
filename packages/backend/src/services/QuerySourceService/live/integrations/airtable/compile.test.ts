import {
    ApiConnectorType,
    FilterOperator,
    getItemMap,
    SupportedDbtAdapter,
    type FilterGroup,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { airtableIntegration } from '.';
import { buildLiveExplore } from '../../explores/definition';
import { TABLE_ID, TICKETS_TABLE } from './airtable.fixtures';
import { compileAirtableQuery, toFieldReference } from './compile';
import {
    AIRTABLE_TABLES_EXPLORE,
    readAirtableTables,
    toAirtableTableExplore,
} from './model';

const [TICKETS] = readAirtableTables([TICKETS_TABLE]);
const DEFINITION = toAirtableTableExplore(TICKETS);

const EXPLORE = buildLiveExplore({
    definition: DEFINITION,
    exploreName: 'tickets_records',
    label: 'Tickets',
    connectionUuid: 'connection-uuid',
    integration: ApiConnectorType.AIRTABLE,
    baseVersion: 1,
    capabilities: airtableIntegration.query.capabilities,
    warehouseSqlBuilder: warehouseSqlBuilderFromType(
        SupportedDbtAdapter.DUCKDB,
    ),
});

const rule = (
    field: string,
    operator: FilterOperator,
    values: unknown[] = [],
): FilterRule => ({
    id: `${field}-${operator}`,
    target: { fieldId: `tickets_records_${field}` },
    operator,
    values,
});

const query = (overrides: Partial<MetricQuery> = {}): MetricQuery => ({
    exploreName: 'tickets_records',
    dimensions: ['tickets_records_name', 'tickets_records_status'],
    metrics: [],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
    ...overrides,
});

const compile = (metricQuery: MetricQuery) =>
    compileAirtableQuery({ explore: EXPLORE, metricQuery });

const formulaOf = (dimensions: FilterGroup) =>
    JSON.parse(compile(query({ filters: { dimensions } })).query)
        .filterByFormula;

const and = (...rules: FilterRule[]): FilterGroup => ({
    id: 'root',
    and: rules,
});

describe('Airtable fields', () => {
    it('turns each readable field into a dimension of its type', () => {
        expect(
            DEFINITION.dimensions.map(({ name, apiName, type }) => [
                name,
                apiName,
                type,
            ]),
        ).toEqual([
            ['record_id', '$id', 'string'],
            ['created_time', '$createdTime', 'timestamp'],
            ['name', 'Name', 'string'],
            ['status', 'Status', 'string'],
            ['assignee', 'Assignee', 'string'],
            ['story_points', 'Story points', 'number'],
            ['resolved', 'Resolved', 'boolean'],
            ['due', 'Due', 'date'],
            ['closed_at', 'Closed at', 'timestamp'],
            ['tags', 'Tags', 'string'],
            // A formula takes its result's type; buttons hold nothing
            ['age_days', 'Age (days)', 'number'],
            ['name_2', 'Name', 'string'],
        ]);
    });
});

describe('compileAirtableQuery', () => {
    it('selects fields by name and sorts in Airtable', () => {
        const compiled = compile(
            query({
                sorts: [
                    { fieldId: 'tickets_records_status', descending: true },
                ],
            }),
        );
        expect(JSON.parse(compiled.query)).toEqual({
            read: 'records',
            table: TABLE_ID,
            fields: ['Name', 'Status'],
            sort: [{ field: 'Status', direction: 'desc' }],
        });
        expect(compiled.localSorts).toEqual([]);
    });

    it('names the checkboxes, so unticked ones read as false', () => {
        expect(
            JSON.parse(
                compile(
                    query({
                        dimensions: [
                            'tickets_records_name',
                            'tickets_records_resolved',
                        ],
                    }),
                ).query,
            ),
        ).toEqual({
            read: 'records',
            table: TABLE_ID,
            fields: ['Name', 'Resolved'],
            checkboxes: ['Resolved'],
        });
    });

    it('sorts every column here when one is the creation time', () => {
        const sorts = [
            { fieldId: 'tickets_records_status', descending: false },
            { fieldId: 'tickets_records_created_time', descending: true },
        ];
        const compiled = compile(
            query({
                dimensions: [
                    'tickets_records_status',
                    'tickets_records_created_time',
                ],
                sorts,
            }),
        );
        expect(JSON.parse(compiled.query)).toEqual({
            read: 'records',
            table: TABLE_ID,
            fields: ['Status', '$createdTime'],
        });
        expect(compiled.localSorts).toEqual(sorts);
    });

    it('writes text filters, case-insensitive where Lightdash is', () => {
        expect(
            formulaOf(
                and(
                    rule('status', FilterOperator.EQUALS, ['Open', 'Pending']),
                    rule('name', FilterOperator.INCLUDE, ['Login "bug"']),
                    rule('tags', FilterOperator.STARTS_WITH, ['P1']),
                    rule('assignee', FilterOperator.NULL),
                ),
            ),
        ).toBe(
            'AND(OR({Status} & "" = "Open", {Status} & "" = "Pending"), FIND("login \\"bug\\"", LOWER({Name} & "")) > 0, LEFT(LOWER({Tags} & ""), 2) = "p1", LEN({Assignee} & "") = 0)',
        );
    });

    it('guards numbers against blanks, which equal 0 in formulas', () => {
        expect(
            formulaOf(
                and(
                    rule('story_points', FilterOperator.GREATER_THAN, [3]),
                    rule('story_points', FilterOperator.NOT_EQUALS, [0]),
                ),
            ),
        ).toBe(
            'AND(AND(LEN({Story points} & "") > 0, {Story points} > 3), OR(LEN({Story points} & "") = 0, {Story points} != 0))',
        );
    });

    it('compares dates and times in UTC, the record time included', () => {
        expect(
            formulaOf(
                and(
                    rule('due', FilterOperator.EQUALS, ['2026-11-01']),
                    rule('created_time', FilterOperator.IN_BETWEEN, [
                        '2026-11-01',
                        '2026-11-30T23:59:59Z',
                    ]),
                ),
            ),
        ).toBe(
            'AND(AND(LEN({Due} & "") > 0, IS_SAME({Due}, DATETIME_PARSE("2026-11-01"), "day")), AND(LEN(CREATED_TIME() & "") > 0, AND(NOT(IS_BEFORE(CREATED_TIME(), DATETIME_PARSE("2026-11-01T00:00:00.000Z"))), NOT(IS_AFTER(CREATED_TIME(), DATETIME_PARSE("2026-11-30T23:59:59.000Z"))))))',
        );
    });

    it('keeps OR groups and nested groups', () => {
        expect(
            formulaOf({
                id: 'root',
                or: [
                    rule('resolved', FilterOperator.EQUALS, [false]),
                    {
                        id: 'nested',
                        and: [
                            rule('resolved', FilterOperator.EQUALS, [true]),
                            rule('record_id', FilterOperator.EQUALS, [
                                'recAbCdEfGhIjKlMn',
                            ]),
                        ],
                    },
                ],
            }),
        ).toBe(
            'OR(NOT({Resolved}), AND({Resolved} = TRUE(), RECORD_ID() & "" = "recAbCdEfGhIjKlMn"))',
        );
    });

    it('skips disabled and empty rules', () => {
        expect(
            formulaOf(
                and(
                    {
                        ...rule('status', FilterOperator.EQUALS, ['Open']),
                        disabled: true,
                    },
                    rule('name', FilterOperator.EQUALS, []),
                ),
            ),
        ).toBeUndefined();
    });

    it('refuses what a formula cannot name or read', () => {
        expect(() => toFieldReference('Odd}name')).toThrow(/rename it/);
        expect(() =>
            formulaOf(
                and(rule('story_points', FilterOperator.EQUALS, ['many'])),
            ),
        ).toThrow(/isn't a number/);
        expect(() => compile(query({ dimensions: [] }))).toThrow(
            /at least one field/,
        );
    });
});

describe('Airtable table explores', () => {
    it('names each table explore by its id and reads that table', () => {
        expect(DEFINITION).toMatchObject({
            name: TABLE_ID.toLowerCase(),
            apiName: TABLE_ID,
            label: 'Tickets',
        });
        expect(DEFINITION).not.toHaveProperty('onByDefault');
    });
});

describe('Airtable tables explore', () => {
    const explore = buildLiveExplore({
        definition: AIRTABLE_TABLES_EXPLORE,
        exploreName: 'support_tables',
        label: 'Tables',
        connectionUuid: 'connection-uuid',
        integration: ApiConnectorType.AIRTABLE,
        baseVersion: 1,
        capabilities: airtableIntegration.query.capabilities,
        warehouseSqlBuilder: warehouseSqlBuilderFromType(
            SupportedDbtAdapter.DUCKDB,
        ),
    });

    it('reads the base schema and sorts here', () => {
        const sorts = [{ fieldId: 'support_tables_name', descending: false }];
        const compiled = compileAirtableQuery({
            explore,
            metricQuery: query({
                exploreName: 'support_tables',
                dimensions: [
                    'support_tables_name',
                    'support_tables_field_count',
                ],
                sorts,
            }),
        });
        expect(JSON.parse(compiled.query)).toEqual({
            read: 'tables',
            fields: ['name', 'fieldCount'],
        });
        expect(compiled.localSorts).toEqual(sorts);
    });

    it('lists every table field as a column', () => {
        expect(
            Object.values(getItemMap(explore)).map(({ name }) => name),
        ).toEqual([
            'table_id',
            'name',
            'description',
            'primary_field',
            'field_count',
        ]);
    });
});
