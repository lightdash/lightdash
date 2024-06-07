import {
    assertUnreachable,
    BinType,
    CompiledCustomSqlDimension,
    CompiledDimension,
    CompiledMetricQuery,
    CompiledTable,
    convertFieldRefToFieldId,
    CustomBinDimension,
    CustomDimension,
    DbtModelJoinType,
    Explore,
    FieldId,
    FieldReferenceError,
    FieldType,
    FilterGroup,
    FilterRule,
    ForbiddenError,
    getCustomMetricDimensionId,
    getDateDimension,
    getDimensions,
    getFieldQuoteChar,
    getFieldsFromMetricQuery,
    getFilterRulesFromGroup,
    getItemId,
    getMetrics,
    getSqlForTruncatedDate,
    IntrinsicUserAttributes,
    isAndFilterGroup,
    isCompiledCustomSqlDimension,
    isCustomBinDimension,
    isFilterGroup,
    isFilterRuleDefinedForFieldId,
    ItemsMap,
    MetricFilterRule,
    parseAllReferences,
    renderFilterRuleSql,
    renderTableCalculationFilterRuleSql,
    SortField,
    SupportedDbtAdapter,
    TimeFrames,
    UnitOfTime,
    UserAttributeValueMap,
    WarehouseClient,
    WeekDay,
} from '@lightdash/common';
import { isArray } from 'lodash';
import { hasUserAttribute } from './services/UserAttributesService/UserAttributeUtils';

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

const replaceAttributes = (
    regex: RegExp,
    sqlFilter: string,
    userAttributes: Record<string, string | string[]>,
    stringQuoteChar: string,
    filter: string,
): string => {
    const sqlAttributes = sqlFilter.match(regex);

    if (sqlAttributes === null || sqlAttributes.length === 0) {
        return sqlFilter;
    }

    const replacedUserAttributesSql = sqlAttributes.reduce<string>(
        (acc, sqlAttribute) => {
            const attribute = sqlAttribute.replace(regex, '$1');
            const attributeValues = userAttributes[attribute];

            if (attributeValues === undefined) {
                throw new ForbiddenError(
                    `Missing user attribute "${attribute}" on ${filter}: "${sqlFilter}"`,
                );
            }
            if (attributeValues.length === 0) {
                throw new ForbiddenError(
                    `Invalid or missing user attribute "${attribute}" on ${filter}: "${sqlFilter}"`,
                );
            }

            const valueString = isArray(attributeValues)
                ? attributeValues
                      .map(
                          (attributeValue) =>
                              `${stringQuoteChar}${attributeValue}${stringQuoteChar}`,
                      )
                      .join(', ')
                : `${stringQuoteChar}${attributeValues}${stringQuoteChar}`;

            return acc.replace(sqlAttribute, valueString);
        },
        sqlFilter,
    );

    // NOTE: Wrap the replaced user attributes in parentheses to avoid issues with AND/OR operators
    return `(${replacedUserAttributesSql})`;
};

export const replaceUserAttributes = (
    sqlFilter: string,
    intrinsicUserAttributes: IntrinsicUserAttributes,
    userAttributes: UserAttributeValueMap,
    stringQuoteChar: string = "'",
    filter: string = 'sql_filter',
): string => {
    const userAttributeRegex =
        /\$\{(?:lightdash|ld)\.(?:attribute|attributes|attr)\.(\w+)\}/g;
    const intrinsicUserAttributeRegex =
        /\$\{(?:lightdash|ld)\.(?:user)\.(\w+)\}/g;

    // Replace user attributes in the SQL filter
    const replacedSqlFilter = replaceAttributes(
        userAttributeRegex,
        sqlFilter,
        userAttributes,
        stringQuoteChar,
        filter,
    );

    // Replace intrinsic user attributes in the SQL filter
    return replaceAttributes(
        intrinsicUserAttributeRegex,
        replacedSqlFilter,
        intrinsicUserAttributes,
        stringQuoteChar,
        filter,
    );
};

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

export const sortMonthName = (dimension: CompiledDimension) => {
    const fieldSql = `${dimension.compiledSql}`;
    return `(
        CASE
            WHEN ${fieldSql} = 'January' THEN 1
            WHEN ${fieldSql} = 'February' THEN 2
            WHEN ${fieldSql} = 'March' THEN 3
            WHEN ${fieldSql} = 'April' THEN 4
            WHEN ${fieldSql} = 'May' THEN 5
            WHEN ${fieldSql} = 'June' THEN 6
            WHEN ${fieldSql} = 'July' THEN 7
            WHEN ${fieldSql} = 'August' THEN 8
            WHEN ${fieldSql} = 'September' THEN 9
            WHEN ${fieldSql} = 'October' THEN 10
            WHEN ${fieldSql} = 'November' THEN 11
            WHEN ${fieldSql} = 'December' THEN 12
            ELSE 0
        END
        )`;
};
export const sortDayOfWeekName = (
    dimension: CompiledDimension,
    startOfWeek: WeekDay | null | undefined,
) => {
    const fieldSql = `${dimension.compiledSql}`;
    const calculateDayIndex = (dayNumber: number) => {
        if (startOfWeek === null || startOfWeek === undefined) return dayNumber; // startOfWeek can be 0, so don't do !startOfWeek
        return ((dayNumber + 7 - (startOfWeek + 2)) % 7) + 1;
    };
    return `(
        CASE
            WHEN ${fieldSql} = 'Sunday' THEN ${calculateDayIndex(1)}
            WHEN ${fieldSql} = 'Monday' THEN ${calculateDayIndex(2)}
            WHEN ${fieldSql} = 'Tuesday' THEN ${calculateDayIndex(3)}
            WHEN ${fieldSql} = 'Wednesday' THEN ${calculateDayIndex(4)}
            WHEN ${fieldSql} = 'Thursday' THEN ${calculateDayIndex(5)}
            WHEN ${fieldSql} = 'Friday' THEN ${calculateDayIndex(6)}
            WHEN ${fieldSql} = 'Saturday' THEN ${calculateDayIndex(7)}
            ELSE 0
        END
    )`;
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
    userAttributes = {},
    sorts = [],
}: {
    warehouseClient: WarehouseClient;
    explore: Explore;
    customDimensions: CustomBinDimension[] | undefined;
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
                const baseTable =
                    explore.tables[customDimension.table].sqlTable;
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
                    const widthSql = `${warehouseClient.concatString(
                        `FLOOR(${dimension.compiledSql} / ${width}) * ${width}`,
                        dash,
                        `(FLOOR(${dimension.compiledSql} / ${width}) + 1) * ${width} - 1`,
                    )} AS ${customDimensionName}`;

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

                    const binRangeWhens = customDimension.customRange.map(
                        (range) => {
                            if (range.from === undefined) {
                                // First range
                                return `WHEN ${dimension.compiledSql} < ${
                                    range.to
                                } THEN ${warehouseClient.concatString(
                                    `${quoteChar}<${quoteChar}`,
                                    `${range.to}`,
                                )}`;
                            }
                            if (range.to === undefined) {
                                // Last range
                                return `ELSE ${warehouseClient.concatString(
                                    `${quoteChar}≥${quoteChar}`,
                                    `${range.from}`,
                                )}`;
                            }

                            return `WHEN ${dimension.compiledSql} >= ${
                                range.from
                            } AND ${dimension.compiledSql} < ${
                                range.to
                            } THEN ${warehouseClient.concatString(
                                `${range.from}`,
                                "'-'",
                                `${range.to}`,
                            )}`;
                        },
                    );

                    // Add a NULL case for when the dimension is NULL, returning null as the value so it get's correctly formated with the symbol ∅
                    const rangeWhens = [
                        `WHEN ${dimension.compiledSql} IS NULL THEN NULL`,
                        ...binRangeWhens,
                    ];

                    const customRangeSql = `CASE
                        ${rangeWhens.join('\n')}
                        END
                        AS ${customDimensionName}`;

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

export type CompiledQuery = {
    query: string;
    hasExampleMetric: boolean;
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
}: BuildQueryProps): CompiledQuery => {
    let hasExampleMetric: boolean = false;
    const fields = getFieldsFromMetricQuery(compiledMetricQuery, explore);
    const adapterType: SupportedDbtAdapter = warehouseClient.getAdapterType();
    const {
        dimensions,
        metrics,
        filters,
        sorts,
        limit,
        additionalMetrics,
        compiledCustomDimensions,
    } = compiledMetricQuery;

    const baseTable = explore.tables[explore.baseTable].sqlTable;
    const fieldQuoteChar = getFieldQuoteChar(warehouseClient.credentials.type);
    const stringQuoteChar = warehouseClient.getStringQuoteChar();
    const escapeStringQuoteChar = warehouseClient.getEscapeStringQuoteChar();
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
        if (metric.isAutoGenerated) {
            hasExampleMetric = true;
        }
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
            const metric = getMetricFromId(field, explore, compiledMetricQuery);
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
                return [...acc, ...(metric.tablesReferences || [metric.table])];
            },
            [],
        ),
    ]);

    const getJoinedTables = (tableNames: string[]): string[] => {
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
        return [...allNewReferences, ...getJoinedTables(allNewReferences)];
    };
    const joinedTables = new Set([
        ...selectedTables,
        ...getJoinedTables([...selectedTables]),
    ]);

    const sqlJoins = explore.joinedTables
        .filter((join) => joinedTables.has(join.table) || join.always)
        .map((join) => {
            const joinTable = explore.tables[join.table].sqlTable;
            const joinType = getJoinType(join.type);

            const alias = join.table;
            const parsedSqlOn = replaceUserAttributes(
                join.compiledSqlOn,
                intrinsicUserAttributes,
                userAttributes,
                stringQuoteChar,
                'sql_on',
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
            return `${fieldQuoteChar}${sort.fieldId}_order${fieldQuoteChar}${
                sort.descending ? ' DESC' : ''
            }`;
        }
        const sortedDimension = compiledDimensions.find(
            (d) => getItemId(d) === sort.fieldId,
        );

        if (
            sortedDimension &&
            sortedDimension.timeInterval === TimeFrames.MONTH_NAME
        ) {
            return sortMonthName(sortedDimension);
        }
        if (
            sortedDimension &&
            sortedDimension.timeInterval === TimeFrames.DAY_OF_WEEK_NAME
        ) {
            return sortDayOfWeekName(sortedDimension, startOfWeek);
        }
        return `${fieldQuoteChar}${sort.fieldId}${fieldQuoteChar}${
            sort.descending ? ' DESC' : ''
        }`;
    });

    const sqlOrderBy =
        fieldOrders.length > 0 ? `ORDER BY ${fieldOrders.join(', ')}` : '';
    const sqlFilterRule = (filter: FilterRule, fieldType?: FieldType) => {
        if (!fieldType) {
            const field = compiledMetricQuery.compiledTableCalculations?.find(
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

        return renderFilterRuleSql(
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
                    const filterSql: string | undefined = isFilterGroup(item)
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
            table.required_filters;
        if (!modelFilterRules) return undefined;
        const reducedRules: string[] = modelFilterRules.reduce<string[]>(
            (acc, filter) => {
                // Convert filter to filter rule
                const filterRule: FilterRule = {
                    id: filter.id,
                    target: {
                        fieldId: convertFieldRefToFieldId(
                            filter.target.fieldRef,
                            table.name,
                        ),
                    },
                    operator: filter.operator,
                    values: filter.values,
                    settings: {
                        unitOfTime: filter.settings?.unitOfTime,
                    },
                };
                let filterString: string | undefined;
                // Required filter is only applied if the filterRule is not already present in the query filters
                const dimension = Object.values(table.dimensions).find(
                    (tc) => getItemId(tc) === filterRule.target.fieldId,
                );
                if (dimension) {
                    // Check if the filter rule is already present in the query filters
                    let dimensionFieldId = filterRule.target.fieldId;
                    const timeDimension =
                        dimension.isIntervalBase ||
                        dimension.timeInterval !== undefined;
                    // If its a time interval dimension, remove the time interval from the field id
                    if (!dimension.isIntervalBase && dimension.timeInterval) {
                        dimensionFieldId = dimensionFieldId.replace(
                            `_${dimension.timeInterval.toLowerCase()}`,
                            '',
                        );
                        const unitOfTime = dimension.timeInterval.toLowerCase();
                    }
                    if (
                        !(
                            dimensionsFilterGroup &&
                            isFilterRuleDefinedForFieldId(
                                dimensionsFilterGroup,
                                dimensionFieldId,
                                timeDimension,
                            )
                        )
                    ) {
                        filterString = `( ${sqlFilterRule(
                            filterRule,
                            FieldType.DIMENSION,
                        )} )`;
                    }
                }
                if (filterString) {
                    return [...acc, filterString];
                }
                return [...acc];
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

    const baseTableSqlWhere = explore.tables[explore.baseTable].sqlWhere;

    const tableSqlWhere = baseTableSqlWhere
        ? [
              replaceUserAttributes(
                  baseTableSqlWhere,
                  intrinsicUserAttributes,
                  userAttributes,
                  stringQuoteChar,
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
        ...tableSqlWhere,
        ...nestedFilterWhere,
        ...requiredFiltersWhere,
    ];

    const sqlWhere =
        allSqlFilters.length > 0 ? `WHERE ${allSqlFilters.join(' AND ')}` : '';

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
        whereMetricFilters
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
        const finalSelect = `SELECT\n${['  *', ...tableCalculationSelects].join(
            ',\n',
        )}`;
        const finalFrom = `FROM ${cteName}`;
        const finalSqlWhere = whereMetricFilters
            ? `WHERE ${whereMetricFilters}`
            : '';
        const secondQuery = [finalSelect, finalFrom, finalSqlWhere].join('\n');

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
            hasExampleMetric,
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
        hasExampleMetric,
        fields,
    };
};
