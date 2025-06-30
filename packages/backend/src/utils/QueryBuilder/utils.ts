import {
    assertUnreachable,
    AuthorizationError,
    BinType,
    CompiledCustomSqlDimension,
    CompiledDimension,
    CompiledExploreJoin,
    CompiledMetric,
    CompiledMetricQuery,
    CompiledTable,
    CustomBinDimension,
    CustomDimension,
    DbtModelJoinType,
    Explore,
    FieldId,
    FieldReferenceError,
    ForbiddenError,
    getCustomRangeSelectSql,
    getDateDimension,
    getDimensions,
    getFieldQuoteChar,
    getFixedWidthBinSelectSql,
    getItemId,
    getMetrics,
    getSqlForTruncatedDate,
    IntrinsicUserAttributes,
    isCompiledCustomSqlDimension,
    JoinRelationship,
    MetricType,
    parseAllReferences,
    QueryWarning,
    SortField,
    SupportedDbtAdapter,
    UserAttributeValueMap,
    WarehouseClient,
    WeekDay,
} from '@lightdash/common';
import { intersection, isArray } from 'lodash';
import { hasUserAttribute } from '../../services/UserAttributesService/UserAttributeUtils';

export const getDimensionFromId = (
    dimId: FieldId,
    explore: Explore,
    adapterType: SupportedDbtAdapter,
    startOfWeek: WeekDay | null | undefined,
    checkUnfilteredTables: boolean = true,
): CompiledDimension => {
    const dimensions = getDimensions(explore);
    const dimension = dimensions.find((d) => getItemId(d) === dimId);

    if (!dimension) {
        const { baseDimensionId, newTimeFrame } = getDateDimension(dimId);

        if (baseDimensionId) {
            const baseField = getDimensionFromId(
                baseDimensionId,
                explore,
                adapterType,
                startOfWeek,
                checkUnfilteredTables,
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
            checkUnfilteredTables &&
            explore.unfilteredTables &&
            getDimensionFromId(
                dimId,
                { ...explore, tables: explore.unfilteredTables },
                adapterType,
                startOfWeek,
                false,
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

export const getDimensionFromFilterTargetId = (
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

export const getMetricFromId = (
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

export const replaceUserAttributesRaw = (
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

export const getJoinType = (type: DbtModelJoinType = 'left') => {
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
        let sql = removeComments(sqlQuery);
        sql = sql.trim().replace(/;+$/g, '');
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
    | {
          ctes: string[];
          join: string | undefined;
          tables: string[];
          selects: string[];
      }
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

    return {
        ctes,
        join: joins.length > 0 ? `CROSS JOIN ${joins.join(',\n')}` : undefined,
        tables: [...new Set(tables)],
        selects,
    };
};

export const getJoinedTables = (
    explore: Explore,
    tableNames: string[],
): string[] => {
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

/**
 * Determines if a metric type is "inflation-proof" (not affected by join inflation)
 */
const isInflationProofMetric = (metricType: MetricType): boolean =>
    [MetricType.COUNT_DISTINCT, MetricType.MIN, MetricType.MAX].includes(
        metricType,
    );

const findTablesWithInflationFromJoin = (join: CompiledExploreJoin) => {
    const tablesWithInflation = new Set<string>();
    if (!join.tablesReferences) {
        // Skip, as we can't detect inflation without knowing table references in join SQL
        return tablesWithInflation;
    }
    if (join.relationship === JoinRelationship.ONE_TO_MANY) {
        // The tables used to join the table can have metric inflation
        const joinFrom = join.tablesReferences.filter(
            (table) => table !== join.table,
        );
        joinFrom.forEach(tablesWithInflation.add.bind(tablesWithInflation));
    } else if (join.relationship === JoinRelationship.MANY_TO_ONE) {
        // The table being joined can have metric inflation
        tablesWithInflation.add(join.table);
    }

    return tablesWithInflation;
};

const findChainedOneToOneTableJoins = ({
    tables,
    possibleJoins,
}: {
    tables: Set<string>;
    possibleJoins: CompiledExploreJoin[];
}) => {
    const result = new Set<string>();
    // Keep track of visited tables to avoid infinite recursion
    const visited = new Set<string>();

    const findReferences = (currentTables: Set<string>) => {
        const newTables = new Set<string>();

        for (const tableName of currentTables) {
            if (!visited.has(tableName)) {
                visited.add(tableName);
                possibleJoins.forEach((join) => {
                    if (
                        join.tablesReferences &&
                        join.tablesReferences.includes(tableName) &&
                        (!join.relationship ||
                            join.relationship === JoinRelationship.ONE_TO_ONE)
                    ) {
                        join.tablesReferences.forEach((from) => {
                            if (!result.has(from)) {
                                result.add(from);
                                newTables.add(from);
                            }
                        });
                    }
                });
            }
        }

        // Recursively process newly found tables
        if (newTables.size > 0) {
            findReferences(newTables);
        }
    };

    findReferences(tables);
    return result;
};

const findTablesWithMetricInflation = ({
    baseTable,
    joinedTables,
    possibleJoins,
    tables,
}: Pick<
    FindMetricInflationWarningsProps,
    'baseTable' | 'joinedTables' | 'possibleJoins' | 'tables'
>): {
    tablesWithMetricInflation: Set<string>;
    joinWithoutRelationship: Set<string>;
    tablesWithoutPrimaryKey: Set<string>;
} => {
    const tablesWithMetricInflation = new Set<string>();
    const joinWithoutRelationship = new Set<string>();
    const tablesWithoutPrimaryKey = new Set<string>();

    joinedTables.forEach((joinedTable) => {
        if (!tables[joinedTable]?.primaryKey) {
            // Warn the user about missing primary key so we can detect possible metric inflation
            tablesWithoutPrimaryKey.add(joinedTable);
        }

        if (joinedTable === baseTable) {
            // skip base table
            return;
        }

        const join = possibleJoins.find(
            (possibleJoin) => possibleJoin.table === joinedTable,
        );
        if (!join) {
            throw new Error(`Join ${joinedTable} not found`);
        }
        if (!join.tablesReferences) {
            // Skip, as we can't detect inflation without knowing table references in join SQL
            return;
        }
        if (!join.relationship) {
            // Warn the user about missing relationship so we can detect possible metric inflation
            joinWithoutRelationship.add(joinedTable);
        } else {
            // Finds tables with inflation in this join
            const tablesWithInflationFromJoin =
                findTablesWithInflationFromJoin(join);
            // Finds chained joins with one-to-one relationship
            const chainedTablesWithInflation = findChainedOneToOneTableJoins({
                tables: tablesWithInflationFromJoin,
                possibleJoins,
            });
            const newTablesWithInflation = new Set([
                ...tablesWithInflationFromJoin,
                ...chainedTablesWithInflation,
            ]);
            if (
                intersection(
                    Array.from(tablesWithMetricInflation),
                    Array.from(newTablesWithInflation),
                ).length > 0
            ) {
                // if there are multiple one-to-many or many-to-one joins affecting the same table, all tables in the query can have metric inflation
                joinedTables.forEach(
                    tablesWithMetricInflation.add.bind(
                        tablesWithMetricInflation,
                    ),
                );
            } else {
                // otherwise, add tables with inflation related to this join
                newTablesWithInflation.forEach(
                    tablesWithMetricInflation.add.bind(
                        tablesWithMetricInflation,
                    ),
                );
            }
        }
    });

    return {
        tablesWithMetricInflation,
        joinWithoutRelationship,
        tablesWithoutPrimaryKey,
    };
};

type FindMetricInflationWarningsProps = {
    tables: { [tableName: string]: Pick<CompiledTable, 'primaryKey'> };
    possibleJoins: Explore['joinedTables']; // all joins metadata
    baseTable: Explore['baseTable']; // query table
    joinedTables: Set<string>; // query joined tables
    metrics: Pick<CompiledMetric, 'name' | 'table' | 'type' | 'label'>[]; // metrics in query
};

/**
 * Analyzes joins and metrics to identify potential metric inflation issues.
 */
export const findMetricInflationWarnings = ({
    tables,
    possibleJoins,
    baseTable,
    joinedTables,
    metrics,
}: FindMetricInflationWarningsProps): QueryWarning[] => {
    // Early return if empty joins or metrics
    if (metrics.length === 0 || joinedTables.size === 0) {
        return [];
    }

    // Find tables that potentially have metric inflation and tables without relationship value
    const {
        tablesWithMetricInflation,
        joinWithoutRelationship,
        tablesWithoutPrimaryKey,
    } = findTablesWithMetricInflation({
        baseTable,
        joinedTables,
        possibleJoins,
        tables,
    });

    // Find what metrics belong to those tables
    const metricsWithInflation = metrics.filter(
        (metric) =>
            tablesWithMetricInflation.has(metric.table) &&
            !isInflationProofMetric(metric.type),
    );

    // Generate warnings
    const warnings: QueryWarning[] = [];
    joinWithoutRelationship.forEach((table) => {
        warnings.push({
            message: `Join **"${table}"** is missing a join relationship type. This can prevent data duplication in joins. [Read more](https://docs.lightdash.com/references/joins#sql-fanouts)`,
            tables: [table],
        });
    });
    tablesWithoutPrimaryKey.forEach((table) => {
        warnings.push({
            message: `Table **"${table}"** is missing a primary key definition. This can prevent data duplication in joins. [Read more](https://docs.lightdash.com/references/tables#defining-primary-keys)`,
            tables: [table],
        });
    });
    metricsWithInflation.forEach((metric) => {
        warnings.push({
            message: `Metric **"${metric.label}"** could be inflated due to join relationships. [Read more](https://docs.lightdash.com/references/joins#metric-inflation-in-sql-joins)`,
            fields: [getItemId(metric)],
            tables: [metric.table],
        });
    });
    return warnings;
};
