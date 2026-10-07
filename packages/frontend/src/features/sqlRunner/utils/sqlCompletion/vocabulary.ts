import { WarehouseTypes } from '@lightdash/common';

// Words that end an identifier run: never read as a table alias or column
export const RESERVED_WORDS = new Set([
    'ALL',
    'AND',
    'ANY',
    'AS',
    'ASC',
    'BETWEEN',
    'BY',
    'CASE',
    'CROSS',
    'DESC',
    'DISTINCT',
    'ELSE',
    'END',
    'EXCEPT',
    'EXISTS',
    'FALSE',
    'FETCH',
    'FROM',
    'FULL',
    'GROUP',
    'HAVING',
    'ILIKE',
    'IN',
    'INNER',
    'INTERSECT',
    'IS',
    'JOIN',
    'LATERAL',
    'LEFT',
    'LIKE',
    'LIMIT',
    'NATURAL',
    'NOT',
    'NULL',
    'OFFSET',
    'ON',
    'OR',
    'ORDER',
    'OUTER',
    'OVER',
    'PIVOT',
    'QUALIFY',
    'RIGHT',
    'SELECT',
    'THEN',
    'TRUE',
    'UNION',
    'UNPIVOT',
    'USING',
    'WHEN',
    'WHERE',
    'WINDOW',
    'WITH',
]);

// Reserved words after which a value is complete, so an operator comes next
export const VALUE_ENDING_WORDS = new Set(['NULL', 'TRUE', 'FALSE', 'END']);

export const STATEMENT_START_KEYWORDS = ['SELECT', 'WITH'];

const SET_OPERATION_KEYWORDS = [
    'UNION ALL',
    'UNION DISTINCT',
    'UNION',
    'INTERSECT',
    'EXCEPT',
];

const JOIN_KEYWORDS = [
    'JOIN',
    'LEFT JOIN',
    'INNER JOIN',
    'RIGHT JOIN',
    'FULL OUTER JOIN',
    'CROSS JOIN',
];

const AFTER_FROM_KEYWORDS = [
    'WHERE',
    'GROUP BY',
    'HAVING',
    'QUALIFY',
    'ORDER BY',
    'LIMIT',
];

// Keywords valid right after a table reference in FROM / JOIN
export const AFTER_TABLE_KEYWORDS = [
    'AS',
    ...JOIN_KEYWORDS,
    'ON',
    'USING',
    ...AFTER_FROM_KEYWORDS,
    ...SET_OPERATION_KEYWORDS,
];

// Keywords that start a value inside an expression
export const VALUE_START_KEYWORDS = [
    'CASE',
    'NOT',
    'NULL',
    'TRUE',
    'FALSE',
    'EXISTS',
    'INTERVAL',
];

// Keywords that follow a complete value, per clause
const OPERATOR_KEYWORDS = [
    'AND',
    'OR',
    'NOT',
    'IN',
    'IS NULL',
    'IS NOT NULL',
    'LIKE',
    'ILIKE',
    'BETWEEN',
    'WHEN',
    'THEN',
    'ELSE',
    'END',
];

export const AFTER_VALUE_KEYWORDS: Record<
    'select' | 'where' | 'on' | 'groupBy' | 'having' | 'orderBy',
    string[]
> = {
    select: [
        'AS',
        'FROM',
        'OVER',
        ...OPERATOR_KEYWORDS,
        ...SET_OPERATION_KEYWORDS,
    ],
    where: [...OPERATOR_KEYWORDS, ...AFTER_FROM_KEYWORDS.slice(1)],
    on: [...OPERATOR_KEYWORDS, ...JOIN_KEYWORDS, ...AFTER_FROM_KEYWORDS],
    groupBy: ['HAVING', 'QUALIFY', 'ORDER BY', 'LIMIT'],
    having: [...OPERATOR_KEYWORDS, 'QUALIFY', 'ORDER BY', 'LIMIT'],
    orderBy: [
        'ASC',
        'DESC',
        'NULLS FIRST',
        'NULLS LAST',
        'LIMIT',
        ...SET_OPERATION_KEYWORDS,
    ],
};

export type SqlFunction = { name: string; signature: string };

const COMMON_FUNCTIONS: SqlFunction[] = [
    { name: 'COUNT', signature: 'COUNT(expression)' },
    { name: 'SUM', signature: 'SUM(expression)' },
    { name: 'AVG', signature: 'AVG(expression)' },
    { name: 'MIN', signature: 'MIN(expression)' },
    { name: 'MAX', signature: 'MAX(expression)' },
    { name: 'COALESCE', signature: 'COALESCE(value, ...)' },
    { name: 'NULLIF', signature: 'NULLIF(value1, value2)' },
    { name: 'CAST', signature: 'CAST(expression AS type)' },
    { name: 'ROUND', signature: 'ROUND(number, digits)' },
    { name: 'ABS', signature: 'ABS(number)' },
    { name: 'FLOOR', signature: 'FLOOR(number)' },
    { name: 'CEIL', signature: 'CEIL(number)' },
    { name: 'LOWER', signature: 'LOWER(string)' },
    { name: 'UPPER', signature: 'UPPER(string)' },
    { name: 'TRIM', signature: 'TRIM(string)' },
    { name: 'LENGTH', signature: 'LENGTH(string)' },
    { name: 'CONCAT', signature: 'CONCAT(value, ...)' },
    { name: 'REPLACE', signature: 'REPLACE(string, from, to)' },
    { name: 'SUBSTRING', signature: 'SUBSTRING(string, start, length)' },
    { name: 'SPLIT_PART', signature: 'SPLIT_PART(string, delimiter, part)' },
    { name: 'CURRENT_DATE', signature: 'CURRENT_DATE' },
    { name: 'CURRENT_TIMESTAMP', signature: 'CURRENT_TIMESTAMP' },
    { name: 'DATE_TRUNC', signature: 'DATE_TRUNC(part, date)' },
    { name: 'EXTRACT', signature: 'EXTRACT(part FROM date)' },
    { name: 'ROW_NUMBER', signature: 'ROW_NUMBER() OVER (...)' },
    { name: 'RANK', signature: 'RANK() OVER (...)' },
    { name: 'DENSE_RANK', signature: 'DENSE_RANK() OVER (...)' },
    { name: 'LAG', signature: 'LAG(expression, offset) OVER (...)' },
    { name: 'LEAD', signature: 'LEAD(expression, offset) OVER (...)' },
    { name: 'FIRST_VALUE', signature: 'FIRST_VALUE(expression) OVER (...)' },
    { name: 'LAST_VALUE', signature: 'LAST_VALUE(expression) OVER (...)' },
];

const DIALECT_FUNCTIONS: Partial<Record<WarehouseTypes, SqlFunction[]>> = {
    [WarehouseTypes.BIGQUERY]: [
        { name: 'SAFE_CAST', signature: 'SAFE_CAST(expression AS type)' },
        { name: 'SAFE_DIVIDE', signature: 'SAFE_DIVIDE(x, y)' },
        { name: 'IFNULL', signature: 'IFNULL(expression, replacement)' },
        { name: 'IF', signature: 'IF(condition, true_value, false_value)' },
        { name: 'COUNTIF', signature: 'COUNTIF(condition)' },
        {
            name: 'APPROX_COUNT_DISTINCT',
            signature: 'APPROX_COUNT_DISTINCT(x)',
        },
        { name: 'ARRAY_AGG', signature: 'ARRAY_AGG(expression)' },
        { name: 'STRING_AGG', signature: 'STRING_AGG(expression, delimiter)' },
        { name: 'UNNEST', signature: 'UNNEST(array)' },
        { name: 'DATE_DIFF', signature: 'DATE_DIFF(date1, date2, part)' },
        { name: 'DATE_ADD', signature: 'DATE_ADD(date, INTERVAL n part)' },
        { name: 'DATE_SUB', signature: 'DATE_SUB(date, INTERVAL n part)' },
        { name: 'TIMESTAMP_TRUNC', signature: 'TIMESTAMP_TRUNC(ts, part)' },
        { name: 'TIMESTAMP_DIFF', signature: 'TIMESTAMP_DIFF(ts1, ts2, part)' },
        { name: 'FORMAT_DATE', signature: 'FORMAT_DATE(format, date)' },
        { name: 'PARSE_DATE', signature: 'PARSE_DATE(format, string)' },
        { name: 'DATE', signature: 'DATE(expression)' },
        { name: 'TIMESTAMP', signature: 'TIMESTAMP(expression)' },
        { name: 'REGEXP_CONTAINS', signature: 'REGEXP_CONTAINS(value, regex)' },
        { name: 'REGEXP_EXTRACT', signature: 'REGEXP_EXTRACT(value, regex)' },
        { name: 'JSON_VALUE', signature: 'JSON_VALUE(json, path)' },
        {
            name: 'GENERATE_DATE_ARRAY',
            signature: 'GENERATE_DATE_ARRAY(start, end)',
        },
    ],
    [WarehouseTypes.SNOWFLAKE]: [
        { name: 'IFF', signature: 'IFF(condition, true_value, false_value)' },
        { name: 'IFNULL', signature: 'IFNULL(expression, replacement)' },
        { name: 'NVL', signature: 'NVL(expression, replacement)' },
        { name: 'TRY_CAST', signature: 'TRY_CAST(expression AS type)' },
        { name: 'DIV0', signature: 'DIV0(dividend, divisor)' },
        { name: 'COUNT_IF', signature: 'COUNT_IF(condition)' },
        { name: 'LISTAGG', signature: 'LISTAGG(expression, delimiter)' },
        { name: 'ARRAY_AGG', signature: 'ARRAY_AGG(expression)' },
        { name: 'DATEADD', signature: 'DATEADD(part, n, date)' },
        { name: 'DATEDIFF', signature: 'DATEDIFF(part, start, end)' },
        { name: 'TO_DATE', signature: 'TO_DATE(expression)' },
        { name: 'TO_TIMESTAMP', signature: 'TO_TIMESTAMP(expression)' },
        { name: 'TO_CHAR', signature: 'TO_CHAR(expression, format)' },
        { name: 'FLATTEN', signature: 'FLATTEN(input => array)' },
        { name: 'PARSE_JSON', signature: 'PARSE_JSON(string)' },
        { name: 'REGEXP_LIKE', signature: 'REGEXP_LIKE(value, regex)' },
        {
            name: 'APPROX_COUNT_DISTINCT',
            signature: 'APPROX_COUNT_DISTINCT(x)',
        },
    ],
    [WarehouseTypes.POSTGRES]: [
        { name: 'STRING_AGG', signature: 'STRING_AGG(expression, delimiter)' },
        { name: 'ARRAY_AGG', signature: 'ARRAY_AGG(expression)' },
        { name: 'TO_CHAR', signature: 'TO_CHAR(expression, format)' },
        { name: 'TO_DATE', signature: 'TO_DATE(string, format)' },
        { name: 'AGE', signature: 'AGE(timestamp1, timestamp2)' },
        { name: 'NOW', signature: 'NOW()' },
        {
            name: 'GENERATE_SERIES',
            signature: 'GENERATE_SERIES(start, stop, step)',
        },
        {
            name: 'REGEXP_REPLACE',
            signature: 'REGEXP_REPLACE(source, pattern, replacement)',
        },
        {
            name: 'JSONB_EXTRACT_PATH_TEXT',
            signature: 'JSONB_EXTRACT_PATH_TEXT(json, path...)',
        },
    ],
    [WarehouseTypes.REDSHIFT]: [
        { name: 'LISTAGG', signature: 'LISTAGG(expression, delimiter)' },
        { name: 'NVL', signature: 'NVL(expression, replacement)' },
        { name: 'DATEADD', signature: 'DATEADD(part, n, date)' },
        { name: 'DATEDIFF', signature: 'DATEDIFF(part, start, end)' },
        { name: 'TO_CHAR', signature: 'TO_CHAR(expression, format)' },
        { name: 'GETDATE', signature: 'GETDATE()' },
    ],
    [WarehouseTypes.DATABRICKS]: [
        { name: 'IF', signature: 'IF(condition, true_value, false_value)' },
        { name: 'IFNULL', signature: 'IFNULL(expression, replacement)' },
        { name: 'NVL', signature: 'NVL(expression, replacement)' },
        { name: 'COLLECT_LIST', signature: 'COLLECT_LIST(expression)' },
        { name: 'DATEADD', signature: 'DATEADD(part, n, date)' },
        { name: 'DATEDIFF', signature: 'DATEDIFF(end, start)' },
        { name: 'DATE_FORMAT', signature: 'DATE_FORMAT(date, format)' },
        { name: 'EXPLODE', signature: 'EXPLODE(array)' },
        { name: 'TO_DATE', signature: 'TO_DATE(expression)' },
    ],
    [WarehouseTypes.TRINO]: [
        { name: 'IF', signature: 'IF(condition, true_value, false_value)' },
        { name: 'TRY_CAST', signature: 'TRY_CAST(expression AS type)' },
        { name: 'DATE_ADD', signature: 'DATE_ADD(unit, value, timestamp)' },
        { name: 'DATE_DIFF', signature: 'DATE_DIFF(unit, ts1, ts2)' },
        { name: 'ARRAY_AGG', signature: 'ARRAY_AGG(expression)' },
        { name: 'APPROX_DISTINCT', signature: 'APPROX_DISTINCT(x)' },
    ],
};

export const getSqlFunctions = (
    warehouseType: WarehouseTypes | undefined,
): SqlFunction[] => {
    const extras = warehouseType
        ? (DIALECT_FUNCTIONS[warehouseType] ?? [])
        : [];
    const names = new Set(COMMON_FUNCTIONS.map((f) => f.name));
    return [...COMMON_FUNCTIONS, ...extras.filter((f) => !names.has(f.name))];
};
