import {
    DashboardFilterRule,
    DimensionType,
    FilterOperator,
    SupportedDbtAdapter,
    WeekDay,
} from '@lightdash/common';

// Common configuration for QueryBuilder
export const DEFAULT_CONFIG = {
    fieldQuoteChar: '"',
    stringQuoteChar: "'",
    escapeStringQuoteChar: "'",
    startOfWeek: WeekDay.MONDAY,
    adapterType: SupportedDbtAdapter.POSTGRES,
};

// Common reference maps
export const SIMPLE_REFERENCE_MAP = {
    test_field: {
        type: DimensionType.STRING,
        sql: '"test_table"."test_field"',
    },
};

export const MULTI_FIELD_REFERENCE_MAP = {
    field1: { type: DimensionType.STRING, sql: '"table"."field1"' },
    field2: { type: DimensionType.NUMBER, sql: '"table"."field2"' },
    field3: { type: DimensionType.BOOLEAN, sql: '"table"."field3"' },
};

// Common filter rules
export const SIMPLE_FILTER_RULE = {
    id: 'filter1',
    target: { fieldId: 'test_field', tableName: 'test_table' },
    operator: FilterOperator.EQUALS,
    values: ['test_value'],
    settings: {},
    disabled: false,
    label: undefined,
} as DashboardFilterRule;

export const SECOND_FILTER_RULE = {
    id: 'filter2',
    target: { fieldId: 'test_field', tableName: 'test_table' },
    operator: FilterOperator.NOT_NULL,
    values: [],
    settings: {},
    disabled: false,
    label: undefined,
} as DashboardFilterRule;

// Expected SQL strings
export const SIMPLE_QUERY_SQL =
    'SELECT\n"test_table"."test_field" AS "test_field"\nFROM "test_table"';

export const QUERY_WITH_FILTER_SQL =
    'SELECT\n"test_table"."test_field" AS "test_field"\nFROM "test_table"\nWHERE ((\n("test_table"."test_field") IN (\'test_value\')\n))';

export const QUERY_WITH_TWO_FILTERS_SQL =
    'SELECT\n"test_table"."test_field" AS "test_field"\nFROM "test_table"\nWHERE ((\n("test_table"."test_field") IN (\'test_value\')\n) AND (\n("test_table"."test_field") IS NOT NULL\n))';

export const QUERY_WITH_SUBQUERY_SQL =
    'SELECT\n"test_field" AS "test_field"\nFROM (\nSELECT test_field FROM source_table WHERE test_field IS NOT NULL\n) AS "subquery"';

export const QUERY_WITH_NESTED_FILTERS_SQL =
    'SELECT\n"table"."field1" AS "field1",\n"table"."field2" AS "field2",\n"table"."field3" AS "field3"\nFROM "table"\nWHERE ((\n("table"."field1") IN (\'value1\')\n) AND ((\n("table"."field2") > (10)\n) OR (\n("table"."field3") = true\n)))';

export const QUERY_WITH_EMPTY_SELECT_SQL = 'SELECT\n*\nFROM "test_table"';
