import {
    assertUnreachable,
    AuthorizationError,
    BinType,
    CompiledCustomSqlDimension,
    CompiledDimension,
    CompiledMetricQuery,
    CompiledTable,
    createFilterRuleFromRequiredMetricRule,
    CustomBinDimension,
    CustomDimension,
    DbtModelJoinType,
    DimensionType,
    Explore,
    FieldId,
    FieldReferenceError,
    FieldType,
    FilterGroup,
    FilterRule,
    ForbiddenError,
    getCustomMetricDimensionId,
    getCustomRangeSelectSql,
    getDateDimension,
    getDimensions,
    getFieldQuoteChar,
    getFieldsFromMetricQuery,
    getFilterRulesFromGroup,
    getFixedWidthBinSelectSql,
    getItemId,
    getMetrics,
    getSqlForTruncatedDate,
    IntrinsicUserAttributes,
    isAndFilterGroup,
    isCompiledCustomSqlDimension,
    isCustomBinDimension,
    isDashboardReferenceTarget,
    isFilterGroup,
    isFilterRuleInQuery,
    ItemsMap,
    MetricFilterRule,
    parseAllReferences,
    renderFilterRuleSql,
    renderFilterRuleSqlFromField,
    renderTableCalculationFilterRuleSql,
    SortField,
    SupportedDbtAdapter,
    TimeFrames,
    UserAttributeValueMap,
    WarehouseClient,
    WeekDay,
} from '@lightdash/common';
import { isArray } from 'lodash';
import { hasUserAttribute } from './services/UserAttributesService/UserAttributeUtils';
import { wrapSentryTransactionSync } from './utils';

const getDimensionFromId = (
    dimId: FieldId,
    explore: Explore,
    adapterType: SupportedDbtAdapter,
    startOfWeek: WeekDay | null | undefined,
): CompiledDimension => {
    const dimensions = getDimensions(explore);
    const dimension = dimensions.find((d) => getItemId(d) === dimId);

    if (dimension === undefined) {
        const { baseDimensionId, newTimeFrame } = getDateDimension(dimId);

        if (baseDimensionId) {
            const baseField = getDimensionFromId(
                baseDimensionId,
                explore,
                adapterType,
                startOfWeek,
            );
            if (baseField && newTimeFrame)
                return {
                    ...baseField,
                    compiledSql: getSqlForTruncatedDate(
                        adapterType,
                        newTimeFrame,
                        baseField.compiledSql,
                        baseField.type,
                        startOfWeek,
                    ),
                    timeInterval: newTimeFrame,
                };
        }

        // At this point, we couldn't find the dimension with the given id in the explore
        // it is possible that the explore is a joined table and is filtered by user_attributes
        // So we check if the dimension exists in the unfiltered tables
        if (
            explore.unfilteredTables &&
            getDimensionFromId(
                dimId,
                { ...explore, tables: explore.unfilteredTables },
                adapterType,
                startOfWeek,
            )
        ) {
            throw new AuthorizationError(
                "You don't have authorization to access this explore",
            );
        }
        throw new FieldReferenceError(
            `Tried to reference dimension with unknown field id: ${dimId}`,
        );
    }
    return dimension;
};

const getDimensionFromFilterTargetId = (
    filterTargetId: FieldId,
    explore: Explore,
    compiledCustomDimensions: CompiledCustomSqlDimension[],
    adapterType: SupportedDbtAdapter,
    startOfWeek: WeekDay | null | undefined,
): CompiledDimension | CompiledCustomSqlDimension => {
    const dim = compiledCustomDimensions.find(
        (cd) => getItemId(cd) === filterTargetId,
    );
    if (dim && isCompiledCustomSqlDimension(dim)) {
        return dim;
    }
    return getDimensionFromId(
        filterTargetId,
        explore,
        adapterType,
        startOfWeek,
    );
};

const getMetricFromId = (
    metricId: FieldId,
    explore: Explore,
    compiledMetricQuery: CompiledMetricQuery,
) => {
    const metrics = [
        ...getMetrics(explore),
        ...(compiledMetricQuery.compiledAdditionalMetrics || []),
    ];
    const metric = metrics.find((m) => getItemId(m) === metricId);
    if (metric === undefined)
        throw new FieldReferenceError(
            `Tried to reference metric with unknown field id: ${metricId}`,
        );
    return metric;
};

const getWrapChars = (wrapChar: string): [string, string] => {
    switch (wrapChar) {
        case '(':
        case ')':
            return ['(', ')'];
        case '':
            return ['', ''];
        default:
            return ['', ''];
    }
};

const replaceAttributes = (
    regex: RegExp,
    sql: string,
    userAttributes: Record<string, string | string[]>,
    quoteChar: string | '',
    wrapChar: string | '',
): string => {
    const sqlAttributes = sql.match(regex);
    const [leftWrap, rightWrap] = getWrapChars(wrapChar);

    if (sqlAttributes === null || sqlAttributes.length === 0) {
        return sql;
    }

    const replacedUserAttributesSql = sqlAttributes.reduce<string>(
        (acc, sqlAttribute) => {
            const attribute = sqlAttribute.replace(regex, '$1');
            const attributeValues = userAttributes[attribute];

            if (attributeValues === undefined) {
                throw new ForbiddenError(
                    `Missing user attribute "${attribute}": "${sql}"`,
                );
            }
            if (attributeValues.length === 0) {
                throw new ForbiddenError(
                    `Invalid or missing user attribute "${attribute}": "${sql}"`,
                );
            }

            const valueString = isArray(attributeValues)
                ? attributeValues
                      .map(
                          (attributeValue) =>
                              `${quoteChar}${attributeValue}${quoteChar}`,
                      )
                      .join(', ')
                : `${quoteChar}${attributeValues}${quoteChar}`;

            return acc.replace(sqlAttribute, valueString);
        },
        sql,
    );

    // NOTE: Wrap the replaced user attributes in parentheses to avoid issues with AND/OR operators
    return `${leftWrap}${replacedUserAttributesSql}${rightWrap}`;
};

export const replaceUserAttributes = (
    sql: string,
    intrinsicUserAttributes: IntrinsicUserAttributes,
    userAttributes: UserAttributeValueMap,
    quoteChar: string,
    wrapChar: string,
): string => {
    const userAttributeRegex =
        /\$\{(?:lightdash|ld)\.(?:attribute|attributes|attr)\.(\w+)\}/g;
    const intrinsicUserAttributeRegex =
        /\$\{(?:lightdash|ld)\.(?:user)\.(\w+)\}/g;

    // Replace user attributes in the SQL filter
    const replacedSqlFilter = replaceAttributes(
        userAttributeRegex,
        sql,
        userAttributes,
        quoteChar,
        wrapChar,
    );

    // Replace intrinsic user attributes in the SQL filter
    return replaceAttributes(
        intrinsicUserAttributeRegex,
        replacedSqlFilter,
        intrinsicUserAttributes,
        quoteChar,
        wrapChar,
    );
};

export const replaceUserAttributesAsStrings = (
    sql: string,
    intrinsicUserAttributes: IntrinsicUserAttributes,
    userAtttributes: UserAttributeValueMap,
    warehouseClient: WarehouseClient,
) =>
    replaceUserAttributes(
        sql,
        intrinsicUserAttributes,
        userAtttributes,
        warehouseClient.getStringQuoteChar(),
        '(',
    );

const replaceUserAttributesRaw = (
    sql: string,
    intrinsicUserAttributes: IntrinsicUserAttributes,
    userAtttributes: UserAttributeValueMap,
) =>
    replaceUserAttributes(
        sql,
        intrinsicUserAttributes,
        userAtttributes,
        '',
        '',
    );

export const assertValidDimensionRequiredAttribute = (
    dimension: CompiledDimension,
    userAttributes: UserAttributeValueMap,
    field: string,
) => {
    // Throw error if user does not have the right requiredAttribute for this dimension
    if (dimension.requiredAttributes)
        Object.entries(dimension.requiredAttributes).map((attribute) => {
            const [attributeName, value] = attribute;
            let hasUserAttributeVal = false;

            if (typeof value === 'string') {
                hasUserAttributeVal = hasUserAttribute(
                    userAttributes,
                    attributeName,
                    value,
                );
            } else {
                hasUserAttributeVal = value.some((v) =>
                    hasUserAttribute(userAttributes, attributeName, v),
                );
            }

            if (!hasUserAttributeVal) {
                throw new ForbiddenError(
                    `Invalid or missing user attribute "${attribute}" on ${field}`,
                );
            }
            return undefined;
        });
};

const getJoinType = (type: DbtModelJoinType = 'left') => {
    switch (type) {
        case 'inner':
            return 'INNER JOIN';
        case 'full':
            return 'FULL OUTER JOIN';
        case 'left':
            return 'LEFT OUTER JOIN';
        case 'right':
            return 'RIGHT OUTER JOIN';
        default:
            return assertUnreachable(type, `Unknown join type: ${type}`);
    }
};

export const sortMonthName = (
    dimension: CompiledDimension,
    fieldQuoteChar: string,
    descending: Boolean,
) => {
    const fieldId = `${fieldQuoteChar}${getItemId(dimension)}${fieldQuoteChar}`;

    return `(
        CASE
            WHEN ${fieldId} = 'January' THEN 1
            WHEN ${fieldId} = 'February' THEN 2
            WHEN ${fieldId} = 'March' THEN 3
            WHEN ${fieldId} = 'April' THEN 4
            WHEN ${fieldId} = 'May' THEN 5
            WHEN ${fieldId} = 'June' THEN 6
            WHEN ${fieldId} = 'July' THEN 7
            WHEN ${fieldId} = 'August' THEN 8
            WHEN ${fieldId} = 'September' THEN 9
            WHEN ${fieldId} = 'October' THEN 10
            WHEN ${fieldId} = 'November' THEN 11
            WHEN ${fieldId} = 'December' THEN 12
            ELSE 0
        END
        )${descending ? ' DESC' : ''}`;
};
export const sortDayOfWeekName = (
    dimension: CompiledDimension,
    startOfWeek: WeekDay | null | undefined,
    fieldQuoteChar: string,
    descending: Boolean,
) => {
    const fieldId = `${fieldQuoteChar}${getItemId(dimension)}${fieldQuoteChar}`;
    const calculateDayIndex = (dayNumber: number) => {
        if (startOfWeek === null || startOfWeek === undefined) return dayNumber; // startOfWeek can be 0, so don't do !startOfWeek
        return ((dayNumber + 7 - (startOfWeek + 2)) % 7) + 1;
    };
    return `(
        CASE
            WHEN ${fieldId} = 'Sunday' THEN ${calculateDayIndex(1)}
            WHEN ${fieldId} = 'Monday' THEN ${calculateDayIndex(2)}
            WHEN ${fieldId} = 'Tuesday' THEN ${calculateDayIndex(3)}
            WHEN ${fieldId} = 'Wednesday' THEN ${calculateDayIndex(4)}
            WHEN ${fieldId} = 'Thursday' THEN ${calculateDayIndex(5)}
            WHEN ${fieldId} = 'Friday' THEN ${calculateDayIndex(6)}
            WHEN ${fieldId} = 'Saturday' THEN ${calculateDayIndex(7)}
            ELSE 0
        END
    )${descending ? ' DESC' : ''}`;
};
// Remove comments and limit clauses from SQL
const removeComments = (sql: string): string => {
    let s = sql.trim();
    // remove single-line comments
    s = s.replace(/--.*$/gm, '');
    // remove multi-line comments
    s = s.replace(/\/\*[\s\S]*?\*\//g, '');
    return s;
};

// Replace strings with placeholders and return the placeholders
const replaceStringsWithPlaceholders = (
    sql: string,
): { sqlWithoutStrings: string; placeholders: string[] } => {
    const stringRegex = /('([^'\\]|\\.)*')|("([^"\\]|\\.)*")/gm;
    const placeholders: string[] = [];
    let index = 0;
    const sqlWithoutStrings = sql.replace(stringRegex, (match) => {
        placeholders.push(match);
        // eslint-disable-next-line no-plusplus
        return `__string_placeholder_${index++}__`;
    });
    return { sqlWithoutStrings, placeholders };
};

// Restore strings from placeholders
const restoreStringsFromPlaceholders = (
    sql: string,
    placeholders: string[],
): string =>
    sql.replace(
        /__string_placeholder_(\d+)__/g,
        (_, p1) => placeholders[Number(p1)],
    );

interface LimitOffsetClause {
    limit: number;
    offset?: number;
}

// Extract the outer limit and offset clauses from a SQL query
const extractOuterLimitOffsetFromSQL = (
    sql: string,
): LimitOffsetClause | undefined => {
    let s = sql.trim();
    // remove comments
    s = removeComments(s);
    // replace strings with placeholders
    const { sqlWithoutStrings } = replaceStringsWithPlaceholders(s);
    // match both LIMIT and optional OFFSET in any order
    const limitOffsetRegex =
        /\b(?:(?:limit\s+(\d+)(?:\s+offset\s+(\d+))?)|(?:offset\s+(\d+)\s+limit\s+(\d+)))\s*(?:;|\s*$)/gi;
    const matches = [...sqlWithoutStrings.matchAll(limitOffsetRegex)];
    if (matches.length > 0) {
        const lastMatch = matches[matches.length - 1];
        // If LIMIT comes first
        if (lastMatch[1] !== undefined) {
            return {
                limit: parseInt(lastMatch[1], 10),
                offset: lastMatch[2] ? parseInt(lastMatch[2], 10) : undefined,
            };
        }
        // If OFFSET comes first
        if (lastMatch[3] !== undefined) {
            return {
                limit: parseInt(lastMatch[4], 10),
                offset: parseInt(lastMatch[3], 10),
            };
        }
    }
    return undefined;
};

// Remove the outermost limit and offset clauses from SQL
const removeCommentsAndOuterLimitOffset = (sql: string): string => {
    let s = sql.trim();
    // remove comments
    s = removeComments(s);
    // replace strings with placeholders
    const { sqlWithoutStrings, placeholders } =
        replaceStringsWithPlaceholders(s);
    // remove either "LIMIT x OFFSET y" or "OFFSET y LIMIT x" at the end of the query
    const limitOffsetRegex =
        /(\b(?:(?:limit\s+\d+(?:\s+offset\s+\d+)?)|(?:offset\s+\d+\s+limit\s+\d+))\s*(?:;|\s*)?)$/i;
    let sqlWithoutLimit = sqlWithoutStrings.replace(limitOffsetRegex, '');
    // remove semicolon from the end of the query
    sqlWithoutLimit = sqlWithoutLimit.trim().replace(/;+$/g, '');
    // restore strings
    let sqlRestored = restoreStringsFromPlaceholders(
        sqlWithoutLimit,
        placeholders,
    );
    // normalize multiple spaces to a single space
    sqlRestored = sqlRestored.replace(/\s+/g, ' ');
    // remove any trailing semicolons, including those preceded by whitespace
    sqlRestored = sqlRestored.replace(/\s*;+\s*$/g, '').trim();
    return sqlRestored;
};

// Apply a limit (and optional offset) to a SQL query
export const applyLimitToSqlQuery = ({
    sqlQuery,
    limit,
}: {
    sqlQuery: string;
    limit: number | undefined;
}): string => {
    // do nothing if limit is undefined
    if (limit === undefined) {
        // strip any trailing semicolons and comments
        let sql = sqlQuery.trim().replace(/;+$/g, '');
        sql = removeComments(sql);
        return sql.trim();
    }
    // get any existing outer limit and offset from the SQL query
    const existingLimitOffset = extractOuterLimitOffsetFromSQL(sqlQuery);
    // calculate the new limit
    const limitToAppend =
        existingLimitOffset?.limit !== undefined
            ? Math.min(existingLimitOffset.limit, limit)
            : limit;
    // remove comments and limit/offset clauses from the SQL query
    const sqlWithoutCommentsAndLimits =
        removeCommentsAndOuterLimitOffset(sqlQuery);
    // append the limit and offset (if any) to the SQL query
    let result = `${sqlWithoutCommentsAndLimits} LIMIT ${limitToAppend}`;
    if (existingLimitOffset?.offset !== undefined) {
        result += ` OFFSET ${existingLimitOffset.offset}`;
    }
    return result;
};

export const getCustomSqlDimensionSql = ({
    warehouseClient,
    customDimensions,
}: {
    warehouseClient: WarehouseClient;
    customDimensions: CompiledCustomSqlDimension[] | undefined;
}): { selects: string[]; tables: string[] } | undefined => {
    if (customDimensions === undefined || customDimensions.length === 0) {
        return undefined;
    }
    const fieldQuoteChar = getFieldQuoteChar(warehouseClient.credentials.type);
    const selects = customDimensions.map<string>(
        (customDimension) =>
            `  (${customDimension.compiledSql}) AS ${fieldQuoteChar}${customDimension.id}${fieldQuoteChar}`,
    );

    return {
        selects,
        tables: customDimensions.flatMap((d) => d.tablesReferences),
    };
};

export const getCustomBinDimensionSql = ({
    warehouseClient,
    explore,
    customDimensions,
    intrinsicUserAttributes,
    userAttributes = {},
    sorts = [],
}: {
    warehouseClient: WarehouseClient;
    explore: Explore;
    customDimensions: CustomBinDimension[] | undefined;
    intrinsicUserAttributes: IntrinsicUserAttributes;
    userAttributes: UserAttributeValueMap | undefined;
    sorts: SortField[] | undefined;
}):
    | { ctes: string[]; joins: string[]; tables: string[]; selects: string[] }
    | undefined => {
    const startOfWeek = warehouseClient.getStartOfWeek();

    const fieldQuoteChar = getFieldQuoteChar(warehouseClient.credentials.type);
    if (customDimensions === undefined || customDimensions.length === 0)
        return undefined;

    const getCteReference = (customDimension: CustomDimension) =>
        `${getItemId(customDimension)}_cte`;

    const adapterType: SupportedDbtAdapter = warehouseClient.getAdapterType();
    const ctes = customDimensions.reduce<string[]>((acc, customDimension) => {
        switch (customDimension.binType) {
            case BinType.FIXED_WIDTH:
            case BinType.CUSTOM_RANGE:
                // No need for cte
                return acc;
            case BinType.FIXED_NUMBER:
                const dimension = getDimensionFromId(
                    customDimension.dimensionId,
                    explore,
                    adapterType,
                    startOfWeek,
                );
                const baseTable = replaceUserAttributesRaw(
                    explore.tables[customDimension.table].sqlTable,
                    intrinsicUserAttributes,
                    userAttributes,
                );
                const cte = ` ${getCteReference(customDimension)} AS (
                    SELECT
                        FLOOR(MIN(${dimension.compiledSql})) AS min_id,
                        CEIL(MAX(${dimension.compiledSql})) AS max_id,
                        FLOOR((MAX(${dimension.compiledSql}) - MIN(${
                    dimension.compiledSql
                })) / ${customDimension.binNumber}) AS bin_width
                    FROM ${baseTable} AS ${fieldQuoteChar}${
                    customDimension.table
                }${fieldQuoteChar}
                )`;

                return [...acc, cte];
            default:
                assertUnreachable(
                    customDimension.binType,
                    `Unknown bin type on cte: ${customDimension.binType}`,
                );
        }
        return acc;
    }, []);

    const joins = customDimensions.reduce<string[]>((acc, customDimension) => {
        switch (customDimension.binType) {
            case BinType.CUSTOM_RANGE:
            case BinType.FIXED_WIDTH:
                // No need for cte
                return acc;
            case BinType.FIXED_NUMBER:
                return [...acc, getCteReference(customDimension)];
            default:
                assertUnreachable(
                    customDimension.binType,
                    `Unknown bin type on join: ${customDimension.binType}`,
                );
        }
        return acc;
    }, []);

    const tables = customDimensions.map(
        (customDimension) => customDimension.table,
    );

    const selects = customDimensions.reduce<string[]>(
        (acc, customDimension) => {
            const dimension = getDimensionFromId(
                customDimension.dimensionId,
                explore,
                adapterType,
                startOfWeek,
            );
            // Check required attribute permission for parent dimension
            assertValidDimensionRequiredAttribute(
                dimension,
                userAttributes,
                `custom dimension: "${customDimension.name}"`,
            );

            const customDimensionName = `${fieldQuoteChar}${getItemId(
                customDimension,
            )}${fieldQuoteChar}`;
            const customDimensionOrder = `${fieldQuoteChar}${getItemId(
                customDimension,
            )}_order${fieldQuoteChar}`;
            const cte = `${getCteReference(customDimension)}`;

            // If a custom dimension is sorted, we need to generate a special SQL select that returns a number
            // and not the range as a string
            const isSorted =
                sorts.length > 0 &&
                sorts.find(
                    (sortField) =>
                        getItemId(customDimension) === sortField.fieldId,
                );
            const quoteChar = warehouseClient.getStringQuoteChar();
            const dash = `${quoteChar} - ${quoteChar}`;

            switch (customDimension.binType) {
                case BinType.FIXED_WIDTH:
                    if (!customDimension.binWidth) {
                        throw new Error(
                            `Undefined binWidth for custom dimension ${BinType.FIXED_WIDTH} `,
                        );
                    }

                    const width = customDimension.binWidth;
                    const widthSql = `${getFixedWidthBinSelectSql({
                        binWidth: customDimension.binWidth || 1,
                        baseDimensionSql: dimension.compiledSql,
                        warehouseClient,
                    })} AS ${customDimensionName}`;

                    if (isSorted) {
                        return [
                            ...acc,
                            widthSql,
                            `FLOOR(${dimension.compiledSql} / ${width}) * ${width} AS ${customDimensionOrder}`,
                        ];
                    }
                    return [...acc, widthSql];
                case BinType.FIXED_NUMBER:
                    if (!customDimension.binNumber) {
                        throw new Error(
                            `Undefined binNumber for custom dimension ${BinType.FIXED_NUMBER} `,
                        );
                    }

                    if (customDimension.binNumber <= 1) {
                        // Edge case, bin number with only one bucket does not need a CASE statement
                        return [
                            ...acc,
                            `${warehouseClient.concatString(
                                `${cte}.min_id`,
                                dash,
                                `${cte}.max_id`,
                            )} AS ${customDimensionName}`,
                        ];
                    }

                    const binWidth = `${cte}.bin_width`;

                    const from = (i: number) =>
                        `${cte}.min_id + ${binWidth} * ${i}`;
                    const to = (i: number) =>
                        `${cte}.min_id + ${binWidth} * ${i + 1}`;

                    const binWhens = Array.from(
                        Array(customDimension.binNumber).keys(),
                    ).map((i) => {
                        if (i !== customDimension.binNumber! - 1) {
                            return `WHEN ${dimension.compiledSql} >= ${from(
                                i,
                            )} AND ${dimension.compiledSql} < ${to(
                                i,
                            )} THEN ${warehouseClient.concatString(
                                from(i),
                                dash,
                                to(i),
                            )}`;
                        }
                        return `ELSE ${warehouseClient.concatString(
                            from(i),
                            dash,
                            `${cte}.max_id`,
                        )}`;
                    });

                    // Add a NULL case for when the dimension is NULL, returning null as the value so it get's correctly formated with the symbol ∅
                    const whens = [
                        `WHEN ${dimension.compiledSql} IS NULL THEN NULL`,
                        ...binWhens,
                    ];

                    if (isSorted) {
                        const sortBinWhens = Array.from(
                            Array(customDimension.binNumber).keys(),
                        ).map((i) => {
                            if (i !== customDimension.binNumber! - 1) {
                                return `WHEN ${dimension.compiledSql} >= ${from(
                                    i,
                                )} AND ${dimension.compiledSql} < ${to(
                                    i,
                                )} THEN ${i}`;
                            }
                            return `ELSE ${i}`;
                        });

                        const sortWhens = [
                            `WHEN ${dimension.compiledSql} IS NULL THEN ${customDimension.binNumber}`,
                            ...sortBinWhens,
                        ];

                        return [
                            ...acc,
                            `CASE
                            ${whens.join('\n')}
                            END
                            AS ${customDimensionName}`,
                            `CASE
                            ${sortWhens.join('\n')}
                            END
                            AS ${customDimensionOrder}`,
                        ];
                    }

                    return [
                        ...acc,
                        `CASE
                        ${whens.join('\n')}
                        END
                        AS ${customDimensionName}
                    `,
                    ];
                case BinType.CUSTOM_RANGE:
                    if (!customDimension.customRange) {
                        throw new Error(
                            `Undefined customRange for custom dimension ${BinType.CUSTOM_RANGE} `,
                        );
                    }

                    const customRangeSql = `${getCustomRangeSelectSql({
                        binRanges: customDimension.customRange || [],
                        baseDimensionSql: dimension.compiledSql,
                        warehouseClient,
                    })} AS ${customDimensionName}`;

                    if (isSorted) {
                        const sortedRangeWhens =
                            customDimension.customRange.map((range, i) => {
                                if (range.from === undefined) {
                                    return `WHEN ${dimension.compiledSql} < ${range.to} THEN ${i}`;
                                }
                                if (range.to === undefined) {
                                    return `ELSE ${i}`;
                                }

                                return `WHEN ${dimension.compiledSql} >= ${range.from} AND ${dimension.compiledSql} < ${range.to} THEN ${i}`;
                            });

                        const sortedWhens = [
                            `WHEN ${dimension.compiledSql} IS NULL THEN ${customDimension.customRange.length}`,
                            ...sortedRangeWhens,
                        ];

                        return [
                            ...acc,
                            customRangeSql,
                            `CASE
                        ${sortedWhens.join('\n')}
                        END
                        AS ${customDimensionOrder}`,
                        ];
                    }

                    return [...acc, customRangeSql];

                default:
                    assertUnreachable(
                        customDimension.binType,
                        `Unknown bin type on sql: ${customDimension.binType}`,
                    );
            }
            return acc;
        },
        [],
    );

    return { ctes, joins, tables: [...new Set(tables)], selects };
};

const getJoinedTables = (explore: Explore, tableNames: string[]): string[] => {
    if (tableNames.length === 0) {
        return [];
    }
    const allNewReferences = explore.joinedTables.reduce<string[]>(
        (sum, joinedTable) => {
            if (tableNames.includes(joinedTable.table)) {
                const newReferencesInJoin = parseAllReferences(
                    joinedTable.sqlOn,
                    joinedTable.table,
                ).reduce<string[]>(
                    (acc, { refTable }) =>
                        !tableNames.includes(refTable)
                            ? [...acc, refTable]
                            : acc,
                    [],
                );
                return [...sum, ...newReferencesInJoin];
            }
            return sum;
        },
        [],
    );
    return [...allNewReferences, ...getJoinedTables(explore, allNewReferences)];
};

export type CompiledQuery = {
    query: string;
    fields: ItemsMap;
};

export type BuildQueryProps = {
    explore: Explore;
    compiledMetricQuery: CompiledMetricQuery;
    warehouseClient: WarehouseClient;
    userAttributes?: UserAttributeValueMap;
    intrinsicUserAttributes: IntrinsicUserAttributes;
    timezone: string;
};

export const buildQuery = ({
    explore,
    compiledMetricQuery,
    warehouseClient,
    intrinsicUserAttributes,
    userAttributes = {},
    timezone,
}: BuildQueryProps): CompiledQuery =>
    wrapSentryTransactionSync('QueryBuilder.buildQuery', {}, () => {
        const fields = getFieldsFromMetricQuery(compiledMetricQuery, explore);
        const adapterType: SupportedDbtAdapter =
            warehouseClient.getAdapterType();
        const {
            dimensions,
            metrics,
            filters,
            sorts,
            limit,
            additionalMetrics,
            compiledCustomDimensions,
        } = compiledMetricQuery;
        const baseTable = replaceUserAttributesRaw(
            explore.tables[explore.baseTable].sqlTable,
            intrinsicUserAttributes,
            userAttributes,
        );
        const fieldQuoteChar = getFieldQuoteChar(
            warehouseClient.credentials.type,
        );
        const stringQuoteChar = warehouseClient.getStringQuoteChar();
        const escapeStringQuoteChar =
            warehouseClient.getEscapeStringQuoteChar();
        const startOfWeek = warehouseClient.getStartOfWeek();

        // dimensions contains a mix of Dimensions and CustomDimensions,
        // we want to filter customDimensions from this list as we will handle them separately
        const excludeCustomDimensions = (field: string) =>
            !compiledCustomDimensions.map((cd) => cd.id).includes(field);
        const dimensionSelects = dimensions
            .filter(excludeCustomDimensions)
            .map((field) => {
                const alias = field;
                const dimension = getDimensionFromId(
                    field,
                    explore,
                    adapterType,
                    startOfWeek,
                );

                assertValidDimensionRequiredAttribute(
                    dimension,
                    userAttributes,
                    `dimension: "${field}"`,
                );
                return `  ${dimension.compiledSql} AS ${fieldQuoteChar}${alias}${fieldQuoteChar}`;
            });

        const selectedCustomDimensions = compiledCustomDimensions.filter((cd) =>
            dimensions.includes(cd.id),
        );
        const customBinDimensionSql = getCustomBinDimensionSql({
            warehouseClient,
            explore,
            customDimensions:
                selectedCustomDimensions?.filter(isCustomBinDimension),
            intrinsicUserAttributes,
            userAttributes,
            sorts,
        });
        const customSqlDimensionSql = getCustomSqlDimensionSql({
            warehouseClient,
            customDimensions: selectedCustomDimensions?.filter(
                isCompiledCustomSqlDimension,
            ),
        });

        const sqlFrom = `FROM ${baseTable} AS ${fieldQuoteChar}${explore.baseTable}${fieldQuoteChar}`;

        const metricSelects = metrics.map((field) => {
            const alias = field;
            const metric = getMetricFromId(field, explore, compiledMetricQuery);
            return `  ${metric.compiledSql} AS ${fieldQuoteChar}${alias}${fieldQuoteChar}`;
        });

        if (additionalMetrics)
            additionalMetrics.forEach((metric) => {
                if (
                    metric.baseDimensionName === undefined ||
                    !metrics.includes(`${metric.table}_${metric.name}`)
                )
                    return;

                const dimensionId = getCustomMetricDimensionId(metric);
                const dimension = getDimensionFromId(
                    dimensionId,
                    explore,
                    adapterType,
                    startOfWeek,
                );

                assertValidDimensionRequiredAttribute(
                    dimension,
                    userAttributes,
                    `custom metric: "${metric.name}"`,
                );
            });

        const selectedTables = new Set<string>([
            ...metrics.reduce<string[]>((acc, field) => {
                const metric = getMetricFromId(
                    field,
                    explore,
                    compiledMetricQuery,
                );
                return [...acc, ...(metric.tablesReferences || [metric.table])];
            }, []),
            ...dimensions
                .filter(excludeCustomDimensions)
                .reduce<string[]>((acc, field) => {
                    const dim = getDimensionFromId(
                        field,
                        explore,
                        adapterType,
                        startOfWeek,
                    );
                    return [...acc, ...(dim.tablesReferences || [dim.table])];
                }, []),
            ...(customBinDimensionSql?.tables || []),
            ...(customSqlDimensionSql?.tables || []),
            ...getFilterRulesFromGroup(filters.dimensions).reduce<string[]>(
                (acc, filterRule) => {
                    const dim = getDimensionFromFilterTargetId(
                        filterRule.target.fieldId,
                        explore,
                        compiledCustomDimensions.filter(
                            isCompiledCustomSqlDimension,
                        ),
                        adapterType,
                        startOfWeek,
                    );
                    return [...acc, ...(dim.tablesReferences || [dim.table])];
                },
                [],
            ),
            ...getFilterRulesFromGroup(filters.metrics).reduce<string[]>(
                (acc, filterRule) => {
                    const metric = getMetricFromId(
                        filterRule.target.fieldId,
                        explore,
                        compiledMetricQuery,
                    );
                    return [
                        ...acc,
                        ...(metric.tablesReferences || [metric.table]),
                    ];
                },
                [],
            ),
        ]);

        const tableCompiledSqlWhere =
            explore.tables[explore.baseTable].sqlWhere;
        const tableSqlWhere =
            explore.tables[explore.baseTable].uncompiledSqlWhere;

        const tableSqlWhereTableReferences = tableSqlWhere
            ? parseAllReferences(tableSqlWhere, explore.baseTable)
            : undefined;

        const tablesFromTableSqlWhereFilter = tableSqlWhereTableReferences
            ? tableSqlWhereTableReferences.map((ref) => ref.refTable)
            : [];

        const joinedTables = new Set([
            ...selectedTables,
            ...getJoinedTables(explore, [...selectedTables]),
            ...tablesFromTableSqlWhereFilter,
        ]);

        const sqlJoins = explore.joinedTables
            .filter((join) => joinedTables.has(join.table) || join.always)
            .map((join) => {
                const joinTable = replaceUserAttributesRaw(
                    explore.tables[join.table].sqlTable,
                    intrinsicUserAttributes,
                    userAttributes,
                );
                const joinType = getJoinType(join.type);

                const alias = join.table;
                const parsedSqlOn = replaceUserAttributesAsStrings(
                    join.compiledSqlOn,
                    intrinsicUserAttributes,
                    userAttributes,
                    warehouseClient,
                );
                return `${joinType} ${joinTable} AS ${fieldQuoteChar}${alias}${fieldQuoteChar}\n  ON ${parsedSqlOn}`;
            })
            .join('\n');

        const filteredMetricSelects = getFilterRulesFromGroup(
            filters.metrics,
        ).reduce<string[]>((acc, filter) => {
            const metricInSelect = metrics.find(
                (metric) => metric === filter.target.fieldId,
            );
            if (metricInSelect !== undefined) {
                return acc;
            }
            const alias = filter.target.fieldId;
            const metric = getMetricFromId(
                filter.target.fieldId,
                explore,
                compiledMetricQuery,
            );
            const renderedSql = `  ${metric.compiledSql} AS ${fieldQuoteChar}${alias}${fieldQuoteChar}`;
            return acc.includes(renderedSql) ? acc : [...acc, renderedSql];
        }, []);

        const sqlSelect = `SELECT\n${[
            ...dimensionSelects,
            ...(customBinDimensionSql?.selects || []),
            ...(customSqlDimensionSql?.selects || []),
            ...metricSelects,
            ...filteredMetricSelects,
        ].join(',\n')}`;

        const groups = [
            ...(dimensionSelects.length > 0 ? dimensionSelects : []),
            ...(customBinDimensionSql?.selects || []),
            ...(customSqlDimensionSql?.selects || []),
        ];
        const sqlGroupBy =
            groups.length > 0
                ? `GROUP BY ${groups.map((val, i) => i + 1).join(',')}`
                : '';

        const compiledDimensions = getDimensions(explore);

        let shouldWrapQueryCTE = false;
        const fieldOrders = sorts.map((sort) => {
            if (
                compiledCustomDimensions &&
                compiledCustomDimensions.find(
                    (customDimension) =>
                        getItemId(customDimension) === sort.fieldId &&
                        isCustomBinDimension(customDimension),
                )
            ) {
                // Custom dimensions will have a separate `select` for ordering,
                // that returns the min value (int) of the bin, rather than a string,
                // so we can use it for sorting
                return `${fieldQuoteChar}${
                    sort.fieldId
                }_order${fieldQuoteChar}${sort.descending ? ' DESC' : ''}`;
            }
            const sortedDimension = compiledDimensions.find(
                (d) => getItemId(d) === sort.fieldId,
            );

            if (
                sortedDimension &&
                sortedDimension.timeInterval === TimeFrames.MONTH_NAME
            ) {
                shouldWrapQueryCTE = true;

                return sortMonthName(
                    sortedDimension,
                    getFieldQuoteChar(warehouseClient.credentials.type),
                    sort.descending,
                );
            }
            if (
                sortedDimension &&
                sortedDimension.timeInterval === TimeFrames.DAY_OF_WEEK_NAME
            ) {
                // in BigQuery, we cannot use a function in the ORDER BY clause that references a column that is not aggregated or grouped
                // so we need to wrap the query in a CTE to allow us to reference the column in the ORDER BY clause
                // for consistency, we do it for all warehouses
                shouldWrapQueryCTE = true;
                return sortDayOfWeekName(
                    sortedDimension,
                    startOfWeek,
                    getFieldQuoteChar(warehouseClient.credentials.type),
                    sort.descending,
                );
            }
            return `${fieldQuoteChar}${sort.fieldId}${fieldQuoteChar}${
                sort.descending ? ' DESC' : ''
            }`;
        });

        const sqlOrderBy =
            fieldOrders.length > 0 ? `ORDER BY ${fieldOrders.join(', ')}` : '';
        const sqlFilterRule = (filter: FilterRule, fieldType?: FieldType) => {
            if (!fieldType) {
                const field =
                    compiledMetricQuery.compiledTableCalculations?.find(
                        (tc) => getItemId(tc) === filter.target.fieldId,
                    );
                return renderTableCalculationFilterRuleSql(
                    filter,
                    field,
                    fieldQuoteChar,
                    stringQuoteChar,
                    escapeStringQuoteChar,
                    adapterType,
                    startOfWeek,
                    timezone,
                );
            }

            const field =
                fieldType === FieldType.DIMENSION
                    ? [
                          ...getDimensions(explore),
                          ...compiledCustomDimensions.filter(
                              isCompiledCustomSqlDimension,
                          ),
                      ].find((d) => getItemId(d) === filter.target.fieldId)
                    : getMetricFromId(
                          filter.target.fieldId,
                          explore,
                          compiledMetricQuery,
                      );
            if (!field) {
                throw new FieldReferenceError(
                    `Filter has a reference to an unknown ${fieldType}: ${filter.target.fieldId}`,
                );
            }

            return renderFilterRuleSqlFromField(
                filter,
                field,
                fieldQuoteChar,
                stringQuoteChar,
                escapeStringQuoteChar,
                startOfWeek,
                adapterType,
                timezone,
            );
        };

        const getNestedFilterSQLFromGroup = (
            filterGroup: FilterGroup | undefined,
            fieldType?: FieldType,
        ): string | undefined => {
            if (filterGroup) {
                const operator = isAndFilterGroup(filterGroup) ? 'AND' : 'OR';
                const items = isAndFilterGroup(filterGroup)
                    ? filterGroup.and
                    : filterGroup.or;
                if (items.length === 0) return undefined;
                const filterRules: string[] = items.reduce<string[]>(
                    (sum, item) => {
                        const filterSql: string | undefined = isFilterGroup(
                            item,
                        )
                            ? getNestedFilterSQLFromGroup(item, fieldType)
                            : `(\n  ${sqlFilterRule(item, fieldType)}\n)`;
                        return filterSql ? [...sum, filterSql] : sum;
                    },
                    [],
                );
                return filterRules.length > 0
                    ? `(${filterRules.join(` ${operator} `)})`
                    : undefined;
            }
            return undefined;
        };

        const getNestedDimensionFilterSQLFromModelFilters = (
            table: CompiledTable,
            dimensionsFilterGroup: FilterGroup | undefined,
        ): string | undefined => {
            const modelFilterRules: MetricFilterRule[] | undefined =
                table.requiredFilters;
            if (!modelFilterRules) return undefined;

            const reducedRules: string[] = modelFilterRules.reduce<string[]>(
                (acc, filter) => {
                    const filterRule = createFilterRuleFromRequiredMetricRule(
                        filter,
                        table.name,
                    );
                    const dimension = Object.values(table.dimensions).find(
                        (tc) => getItemId(tc) === filterRule.target.fieldId,
                    );

                    if (!dimension) return acc;
                    if (
                        isFilterRuleInQuery(
                            dimension,
                            filterRule,
                            dimensionsFilterGroup,
                        )
                    )
                        return acc;

                    const filterString = `( ${sqlFilterRule(
                        filterRule,
                        FieldType.DIMENSION,
                    )} )`;
                    return [...acc, filterString];
                },
                [],
            );

            return reducedRules.join(' AND ');
        };

        const requiredDimensionFilterSql =
            getNestedDimensionFilterSQLFromModelFilters(
                explore.tables[explore.baseTable],
                filters.dimensions,
            );

        const tableSqlWhereWithReplacedAttributes = tableCompiledSqlWhere
            ? [
                  replaceUserAttributesAsStrings(
                      tableCompiledSqlWhere,
                      intrinsicUserAttributes,
                      userAttributes,
                      warehouseClient,
                  ),
              ]
            : [];

        const nestedFilterSql = getNestedFilterSQLFromGroup(
            filters.dimensions,
            FieldType.DIMENSION,
        );
        const requiredFiltersWhere = requiredDimensionFilterSql
            ? [requiredDimensionFilterSql]
            : [];
        const nestedFilterWhere = nestedFilterSql ? [nestedFilterSql] : [];
        const allSqlFilters = [
            ...tableSqlWhereWithReplacedAttributes,
            ...nestedFilterWhere,
            ...requiredFiltersWhere,
        ];

        const sqlWhere =
            allSqlFilters.length > 0
                ? `WHERE ${allSqlFilters.join(' AND ')}`
                : '';

        const whereMetricFilters = getNestedFilterSQLFromGroup(
            filters.metrics,
            FieldType.METRIC,
        );

        const tableCalculationFilters = getNestedFilterSQLFromGroup(
            filters.tableCalculations,
        );

        const sqlLimit = `LIMIT ${limit}`;

        if (
            compiledMetricQuery.compiledTableCalculations.length > 0 ||
            whereMetricFilters ||
            shouldWrapQueryCTE
        ) {
            const cteSql = [
                sqlSelect,
                sqlFrom,
                sqlJoins,
                customBinDimensionSql && customBinDimensionSql.joins.length > 0
                    ? `CROSS JOIN ${customBinDimensionSql.joins.join(',\n')}`
                    : undefined,
                sqlWhere,
                sqlGroupBy,
            ]
                .filter((l) => l !== undefined)
                .join('\n');
            const cteName = 'metrics';
            const ctes = [
                ...(customBinDimensionSql?.ctes || []),
                `${cteName} AS (\n${cteSql}\n)`,
            ];
            const tableCalculationSelects =
                compiledMetricQuery.compiledTableCalculations.map(
                    (tableCalculation) => {
                        const alias = tableCalculation.name;
                        return `  ${tableCalculation.compiledSql} AS ${fieldQuoteChar}${alias}${fieldQuoteChar}`;
                    },
                );
            const finalSelect = `SELECT\n${[
                '  *',
                ...tableCalculationSelects,
            ].join(',\n')}`;
            const finalFrom = `FROM ${cteName}`;
            const finalSqlWhere = whereMetricFilters
                ? `WHERE ${whereMetricFilters}`
                : '';
            const secondQuery = [finalSelect, finalFrom, finalSqlWhere].join(
                '\n',
            );

            let finalQuery = secondQuery;
            if (tableCalculationFilters) {
                const queryResultCteName = 'table_calculations';
                ctes.push(`${queryResultCteName} AS (\n${secondQuery}\n)`);

                finalQuery = `SELECT * FROM ${queryResultCteName}`;

                if (tableCalculationFilters)
                    finalQuery += ` WHERE ${tableCalculationFilters}`;
            }
            const cte = `WITH ${ctes.join(',\n')}`;

            return {
                query: [cte, finalQuery, sqlOrderBy, sqlLimit].join('\n'),
                fields,
            };
        }

        const metricQuerySql = [
            customBinDimensionSql && customBinDimensionSql.ctes.length > 0
                ? `WITH ${customBinDimensionSql.ctes.join(',\n')}`
                : undefined,
            sqlSelect,
            sqlFrom,
            sqlJoins,
            customBinDimensionSql && customBinDimensionSql.joins.length > 0
                ? `CROSS JOIN ${customBinDimensionSql.joins.join(',\n')}`
                : undefined,
            sqlWhere,
            sqlGroupBy,
            sqlOrderBy,
            sqlLimit,
        ]
            .filter((l) => l !== undefined)
            .join('\n');

        return {
            query: metricQuerySql,
            fields,
        };
    });

type CteBase = {
    name: string;
};
type SqlCte = CteBase & { sql: string };
type QueryBuilderCte = CteBase & { queryBuilder: QueryBuilder };
type Cte = SqlCte | QueryBuilderCte;
type ReferenceObject = { type: DimensionType; sql: string };
type ReferenceMap = Record<string, ReferenceObject> | undefined;

const isSqlCte = (cte: Cte): cte is SqlCte => 'sql' in cte;

export class QueryBuilder {
    // Column references, to be used in select, filters, etc
    private readonly referenceMap: ReferenceMap;

    private readonly ctes: Cte[];

    // Select values are references
    private readonly select: string[];

    private readonly from: string;

    private readonly filters: FilterGroup | undefined;

    constructor(
        args: {
            referenceMap: ReferenceMap;
            select: string[];
            from: string;
            filters?: FilterGroup;
            ctes?: Cte[];
        },
        private config: {
            fieldQuoteChar: string;
            stringQuoteChar: string;
            escapeStringQuoteChar: string;
            startOfWeek: WeekDay | null | undefined;
            adapterType: SupportedDbtAdapter;
            timezone?: string;
        },
    ) {
        this.ctes = args.ctes || [];
        this.select = args.select;
        this.from = args.from;
        this.filters = args.filters;
        this.referenceMap = args.referenceMap;
    }

    private quotedName(value: String) {
        return `${this.config.fieldQuoteChar}${value}${this.config.fieldQuoteChar}`;
    }

    private getReference(reference: string): ReferenceObject {
        const referenceObject = this.referenceMap?.[reference];
        if (!referenceObject) {
            throw new FieldReferenceError(`Unkown reference: ${reference}`);
        }
        return referenceObject;
    }

    private ctesToSql(): string | undefined {
        if (this.ctes.length === 0) {
            return undefined;
        }
        return `WITH\n${this.ctes
            .map(
                (cte) =>
                    `${this.quotedName(cte.name)} AS (\n${
                        isSqlCte(cte) ? cte.sql : cte.queryBuilder.toSql()
                    }\n)`,
            )
            .join(',\n')}`;
    }

    private selectsToSql(): string | undefined {
        let selectSQL = '*';
        if (this.select.length > 0) {
            selectSQL = this.select
                .map((reference) => {
                    const referenceObject = this.getReference(reference);
                    return `${referenceObject.sql} AS ${this.quotedName(
                        reference,
                    )}`;
                })
                .join(',\n');
        }
        return `SELECT\n${selectSQL}`;
    }

    private fromToSql(): string {
        return `FROM ${this.quotedName(this.from)}`;
    }

    private filtersToSql() {
        // Recursive function to convert filters to SQL
        const getNestedFilterSQLFromGroup = (
            filterGroup: FilterGroup | undefined,
        ): string | undefined => {
            if (filterGroup) {
                const operator = isAndFilterGroup(filterGroup) ? 'AND' : 'OR';
                const items = isAndFilterGroup(filterGroup)
                    ? filterGroup.and
                    : filterGroup.or;
                if (items.length === 0) return undefined;
                const filterRules: string[] = items.reduce<string[]>(
                    (sum, item) => {
                        // Handle nested filters
                        if (isFilterGroup(item)) {
                            const nestedFilterSql =
                                getNestedFilterSQLFromGroup(item);
                            return nestedFilterSql
                                ? [...sum, nestedFilterSql]
                                : sum;
                        }
                        // Handle filter rule
                        if (isDashboardReferenceTarget(item.target)) {
                            const reference = this.getReference(
                                item.target.reference,
                            );
                            const filterSQl = `(\n${renderFilterRuleSql(
                                item,
                                reference.type,
                                reference.sql,
                                this.config.stringQuoteChar,
                                this.config.escapeStringQuoteChar,
                                this.config.startOfWeek,
                                this.config.adapterType,
                                this.config.timezone,
                            )}\n)`;
                            return [...sum, filterSQl];
                        }

                        return sum;
                    },
                    [],
                );
                return filterRules.length > 0
                    ? `(${filterRules.join(` ${operator} `)})`
                    : undefined;
            }
            return undefined;
        };

        const filtersSql = getNestedFilterSQLFromGroup(this.filters);
        if (filtersSql) {
            return `WHERE ${filtersSql}`;
        }
        return undefined;
    }

    toSql(): string {
        // Combine all parts of the query
        return [
            this.ctesToSql(),
            this.selectsToSql(),
            this.fromToSql(),
            this.filtersToSql(),
        ]
            .filter((l) => l !== undefined)
            .join('\n');
    }
}
