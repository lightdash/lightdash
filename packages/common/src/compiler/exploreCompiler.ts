import { type SupportedDbtAdapter } from '../types/dbt';
import { CompileError } from '../types/errors';
import {
    type CompiledExploreJoin,
    type CompiledTable,
    type Explore,
    type ExploreJoin,
    type Table,
} from '../types/explore';
import {
    friendlyName,
    isCustomBinDimension,
    isNonAggregateMetric,
    type CompiledCustomDimension,
    type CompiledCustomSqlDimension,
    type CompiledDimension,
    type CompiledMetric,
    type CustomDimension,
    type CustomSqlDimension,
    type Dimension,
    type Metric,
} from '../types/field';
import { type WarehouseClient } from '../types/warehouse';

import {
    dateGranularityToTimeFrameMap,
    type DateGranularity,
} from '../types/timeFrames';
import { timeFrameConfigs } from '../utils/timeFrames';
import { getFieldQuoteChar } from '../utils/warehouse';
import { renderFilterRuleSql } from './filtersCompiler';

// exclude lightdash prefix from variable pattern
export const lightdashVariablePattern =
    /\$\{((?!(lightdash|ld)\.)[a-zA-Z0-9_.]+)\}/g;

type Reference = {
    refTable: string;
    refName: string;
};
const getParsedReference = (ref: string, currentTable: string): Reference => {
    // Reference to another dimension
    const split = ref.split('.');
    if (split.length > 2) {
        throw new CompileError(
            `Model "${currentTable}" cannot resolve dimension reference: \${${ref}}`,
            {},
        );
    }
    const refTable = split.length === 1 ? currentTable : split[0];
    const refName = split.length === 1 ? split[0] : split[1];

    return { refTable, refName };
};

export const getAllReferences = (raw: string): string[] =>
    (raw.match(lightdashVariablePattern) || []).map(
        (value) => value.slice(2, value.length - 1), // value without brackets
    );

export const parseAllReferences = (
    raw: string,
    currentTable: string,
): Reference[] =>
    getAllReferences(raw).map((ref) => getParsedReference(ref, currentTable));

export type UncompiledExplore = {
    name: string;
    label: string;
    tags: string[];
    baseTable: string;
    groupLabel?: string;
    joinedTables: ExploreJoin[];
    tables: Record<string, Table>;
    targetDatabase: SupportedDbtAdapter;
    sqlWhere?: string;
    warehouse?: string;
    ymlPath?: string;
    sqlPath?: string;
    joinAliases?: Record<string, Record<string, string>>;
};

const getReferencedTable = (
    refTable: string,
    tables: Record<string, Table>,
    currentTable: string,
    joinAliases?: Record<string, Record<string, string>>,
) =>
    Object.values(tables).find((table) => {
        const nameMatch =
            table.name === refTable || table.originalName === refTable;
        if (nameMatch) return true;

        if (!joinAliases?.[currentTable]) return false;
        // Check if this `refTable` is an alias in its join
        return Object.entries(joinAliases[currentTable]).some(
            ([alias, joinTable]) =>
                alias === refTable && joinTable === table.name,
        );
    });
export class ExploreCompiler {
    private readonly warehouseClient: WarehouseClient;

    constructor(warehouseClient: WarehouseClient) {
        this.warehouseClient = warehouseClient;
    }

    compileExplore({
        name,
        label,
        tags,
        baseTable,
        joinedTables,
        tables,
        targetDatabase,
        groupLabel,
        warehouse,
        ymlPath,
        sqlPath,
        joinAliases,
    }: UncompiledExplore): Explore {
        // Check that base table and joined tables exist
        if (!tables[baseTable]) {
            throw new CompileError(
                `Failed to compile explore "${name}". Tried to find base table but cannot find table with name "${baseTable}"`,
                {},
            );
        }
        joinedTables.forEach((join) => {
            if (!tables[join.table]) {
                throw new CompileError(
                    `Failed to compile explore "${name}". Tried to join table "${join.table}" to "${baseTable}" but cannot find table with name "${join.table}"`,
                    {},
                );
            }
        });
        const aliases = [
            baseTable,
            ...joinedTables.map((join) => join.alias || join.table),
        ];
        if (aliases.length !== new Set(aliases).size) {
            throw new CompileError(
                `Failed to compile explore "${name}". Cannot join to the same table multiple times table in an explore. Use an 'alias'`,
                {},
            );
        }
        const includedTables = joinedTables.reduce<Record<string, Table>>(
            (prev, join) => {
                const joinTableName = join.alias || tables[join.table].name;
                const joinTableLabel =
                    join.label ||
                    (join.alias && friendlyName(join.alias)) ||
                    tables[join.table].label;
                const requiredDimensionsForJoin = parseAllReferences(
                    join.sqlOn,
                    join.table,
                ).reduce<string[]>((acc, reference) => {
                    if (reference.refTable === joinTableName) {
                        acc.push(reference.refName);
                    }
                    return acc;
                }, []);

                const tableDimensions = tables[join.table].dimensions;
                return {
                    ...prev,
                    [join.alias || join.table]: {
                        ...tables[join.table],
                        originalName: tables[join.table].name,
                        name: joinTableName,
                        label: joinTableLabel,
                        hidden: join.hidden,
                        dimensions: Object.keys(tableDimensions).reduce<
                            Record<string, Dimension>
                        >((acc, dimensionKey) => {
                            const dimension = tableDimensions[dimensionKey];
                            const isRequired =
                                requiredDimensionsForJoin.includes(
                                    dimensionKey,
                                );

                            const isTimeIntervalBaseDimensionVisible =
                                dimension.timeInterval &&
                                dimension.groups &&
                                join.fields
                                    ? join.fields.includes(
                                          dimension.groups[
                                              dimension.groups.length - 1
                                          ],
                                      )
                                    : true;

                            const isVisible =
                                join.fields === undefined ||
                                join.fields.includes(dimensionKey) ||
                                (dimension.group !== undefined &&
                                    join.fields.includes(dimension.group)) ||
                                isTimeIntervalBaseDimensionVisible;

                            if (isRequired || isVisible) {
                                acc[dimensionKey] = {
                                    ...dimension,
                                    hidden:
                                        join.hidden ||
                                        dimension.hidden ||
                                        !isVisible,
                                    table: joinTableName,
                                    tableLabel: joinTableLabel,
                                };
                            }
                            return acc;
                        }, {}),
                        metrics: Object.keys(tables[join.table].metrics)
                            .filter(
                                (d) =>
                                    join.fields === undefined ||
                                    join.fields.includes(d),
                            )
                            .reduce<Record<string, Metric>>(
                                (prevMetrics, metricKey) => {
                                    const metric =
                                        tables[join.table].metrics[metricKey];
                                    return {
                                        ...prevMetrics,
                                        [metricKey]: {
                                            ...metric,
                                            hidden:
                                                !!join.hidden || metric.hidden,
                                            table: joinTableName,
                                            tableLabel: joinTableLabel,
                                        },
                                    };
                                },
                                {},
                            ),
                    },
                };
            },
            { [baseTable]: tables[baseTable] },
        );

        const compiledTables: Record<string, CompiledTable> = aliases.reduce(
            (prev, tableName) => ({
                ...prev,
                [tableName]: this.compileTable(
                    includedTables[tableName],
                    includedTables,
                    joinAliases,
                ),
            }),
            {},
        );

        const compiledJoins: CompiledExploreJoin[] = joinedTables.map((j) =>
            this.compileJoin(j, includedTables),
        );

        return {
            name,
            label,
            tags,
            baseTable,
            joinedTables: compiledJoins,
            tables: compiledTables,
            targetDatabase,
            groupLabel,
            warehouse,
            ymlPath,
            sqlPath,
        };
    }

    compileTable(
        table: Table,
        tables: Record<string, Table>,
        joinAliases: UncompiledExplore['joinAliases'],
    ): CompiledTable {
        const dimensions: Record<string, CompiledDimension> = Object.keys(
            table.dimensions,
        ).reduce(
            (prev, dimensionKey) => ({
                ...prev,
                [dimensionKey]: this.compileDimension(
                    table.dimensions[dimensionKey],
                    tables,
                ),
            }),
            {},
        );
        const metrics: Record<string, CompiledMetric> = Object.keys(
            table.metrics,
        ).reduce(
            (prev, metricKey) => ({
                ...prev,
                [metricKey]: this.compileMetric(
                    table.metrics[metricKey],
                    tables,
                    joinAliases,
                ),
            }),
            {},
        );
        const compiledSqlWhere = table.sqlWhere
            ? table.sqlWhere.replace(
                  lightdashVariablePattern,
                  (_, p1) =>
                      this.compileDimensionReference(p1, tables, table.name)
                          .sql,
              )
            : undefined;

        return {
            ...table,
            sqlWhere: compiledSqlWhere,
            dimensions,
            metrics,
        };
    }

    compileMetric(
        metric: Metric,
        tables: Record<string, Table>,
        joinAliases?: UncompiledExplore['joinAliases'],
    ): CompiledMetric {
        const compiledMetric = this.compileMetricSql(
            metric,
            tables,
            joinAliases,
        );
        metric.showUnderlyingValues?.forEach((dimReference) => {
            const { refTable, refName } = getParsedReference(
                dimReference,
                metric.table,
            );
            const referencedTable = getReferencedTable(
                refTable,
                tables,
                metric.table,
                joinAliases,
            );
            const isValidReference = !!referencedTable?.dimensions[refName];
            if (!isValidReference) {
                throw new CompileError(
                    `"show_underlying_values" for metric "${metric.name}" has a reference to an unknown dimension: ${dimReference} in table "${metric.table}"`,
                );
            }
        });
        const tablesRequiredAttributes = Array.from(
            compiledMetric.tablesReferences,
        ).reduce<Record<string, Record<string, string | string[]>>>(
            (acc, tableReference) => {
                const table = tables[tableReference] as Table | undefined;
                if (table?.requiredAttributes) {
                    acc[tableReference] = table.requiredAttributes;
                }
                return acc;
            },
            {},
        );
        return {
            ...metric,
            compiledSql: compiledMetric.sql,
            tablesReferences: Array.from(compiledMetric.tablesReferences),
            ...(Object.keys(tablesRequiredAttributes).length
                ? { tablesRequiredAttributes }
                : {}),
        };
    }

    compileMetricSql(
        metric: Metric,
        tables: Record<string, Table>,
        joinAliases: UncompiledExplore['joinAliases'],
    ): { sql: string; tablesReferences: Set<string> } {
        // Metric might have references to other dimensions
        if (!tables[metric.table]) {
            throw new CompileError(
                `Metric "${metric.name}" references a table "${metric.table}" which matches no model`,
                {},
            );
        }
        const currentRef = `${metric.table}.${metric.name}`;
        const currentShortRef = metric.name;
        let tablesReferences = new Set([metric.table]);
        let renderedSql = metric.sql.replace(
            lightdashVariablePattern,
            (_, p1) => {
                if ([currentShortRef, currentRef].includes(p1)) {
                    throw new CompileError(
                        `Metric "${metric.name}" in table "${metric.table}" has a sql string referencing itself: "${metric.sql}"`,
                        {},
                    );
                }

                const compiledReference = isNonAggregateMetric(metric)
                    ? this.compileMetricReference(p1, tables, metric.table)
                    : this.compileDimensionReference(
                          p1,
                          tables,
                          metric.table,
                          joinAliases,
                      );
                tablesReferences = new Set([
                    ...tablesReferences,
                    ...compiledReference.tablesReferences,
                ]);
                return compiledReference.sql;
            },
        );
        if (metric.filters !== undefined && metric.filters.length > 0) {
            if (isNonAggregateMetric(metric)) {
                throw new CompileError(
                    `Error: ${metric.name} - metric filters cannot be used with non-aggregate metrics`,
                );
            }

            const conditions = metric.filters.map((filter) => {
                const fieldRef =
                    // @ts-expect-error This fallback is to support old metric filters in yml. We can delete this after a few months since we can assume all projects have been redeployed
                    filter.target.fieldRef || filter.target.fieldId;
                const { refTable, refName } = getParsedReference(
                    fieldRef,
                    metric.table,
                );

                const table = tables[refTable];

                if (!table) {
                    throw new CompileError(
                        `Filter for metric "${metric.name}" has a reference to an unknown table`,
                    );
                }

                // NOTE: date dimensions from explores have their time format uppercased (e.g. order_date_DAY) - see ticket: https://github.com/lightdash/lightdash/issues/5998
                const dimensionRefName = Object.keys(table.dimensions).find(
                    (key) => key.toLowerCase() === refName.toLowerCase(),
                );

                const dimensionField = dimensionRefName
                    ? table.dimensions[dimensionRefName]
                    : undefined;

                if (!dimensionField) {
                    throw new CompileError(
                        `Filter for metric "${metric.name}" has a reference to an unknown dimension: ${fieldRef}`,
                    );
                }
                const compiledDimension = this.compileDimension(
                    dimensionField,
                    tables,
                );
                if (compiledDimension.tablesReferences) {
                    tablesReferences = new Set([
                        ...tablesReferences,
                        ...compiledDimension.tablesReferences,
                    ]);
                }
                return renderFilterRuleSql(
                    filter,
                    compiledDimension,
                    getFieldQuoteChar(this.warehouseClient.credentials.type),
                    this.warehouseClient.getStringQuoteChar(),
                    this.warehouseClient.getEscapeStringQuoteChar(),
                    this.warehouseClient.getStartOfWeek(),
                    this.warehouseClient.getAdapterType(),
                );
            });
            renderedSql = `CASE WHEN (${conditions.join(
                ' AND ',
            )}) THEN (${renderedSql}) ELSE NULL END`;
        }
        const compiledSql = this.warehouseClient.getMetricSql(
            renderedSql,
            metric,
        );

        return { sql: compiledSql, tablesReferences };
    }

    compileDimension(
        dimension: Dimension,
        tables: Record<string, Table>,
    ): CompiledDimension {
        const compiledDimension = this.compileDimensionSql(dimension, tables);
        const tablesRequiredAttributes = Array.from(
            compiledDimension.tablesReferences,
        ).reduce<Record<string, Record<string, string | string[]>>>(
            (acc, tableReference) => {
                const table = tables[tableReference] as Table | undefined;
                if (table?.requiredAttributes) {
                    acc[tableReference] = table.requiredAttributes;
                }
                return acc;
            },
            {},
        );
        return {
            ...dimension,
            compiledSql: compiledDimension.sql,
            tablesReferences: Array.from(compiledDimension.tablesReferences),
            ...(Object.keys(tablesRequiredAttributes).length
                ? { tablesRequiredAttributes }
                : {}),
        };
    }

    compileDimensionSql(
        dimension: Dimension,
        tables: Record<string, Table>,
    ): { sql: string; tablesReferences: Set<string> } {
        // Dimension might have references to other dimensions
        // Check we don't reference yourself
        const currentRef = `${dimension.table}.${dimension.name}`;
        const currentShortRef = dimension.name;
        let tablesReferences = new Set([dimension.table]);
        const sql = dimension.sql.replace(lightdashVariablePattern, (_, p1) => {
            if ([currentShortRef, currentRef].includes(p1)) {
                throw new CompileError(
                    `Dimension "${dimension.name}" in table "${dimension.table}" has a sql string referencing itself: "${dimension.sql}"`,
                    {},
                );
            }
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            const compiledReference = this.compileDimensionReference(
                p1,
                tables,
                dimension.table,
            );
            tablesReferences = new Set([
                ...tablesReferences,
                ...compiledReference.tablesReferences,
            ]);
            return compiledReference.sql;
        });
        return { sql, tablesReferences };
    }

    compileCustomDimensionSql(
        dimension: CustomSqlDimension,
        tables: Record<string, Table>,
    ): Pick<CompiledCustomSqlDimension, 'compiledSql' | 'tablesReferences'> {
        const currentRef = dimension.id;
        let tablesReferences = new Set<string>([]);
        const compiledSql = dimension.sql.replace(
            lightdashVariablePattern,
            (_, p1) => {
                if (currentRef === p1) {
                    throw new CompileError(
                        `Dimension "${dimension.name}" in table "${dimension.table}" has a sql string referencing itself: "${dimension.sql}"`,
                        {},
                    );
                }

                const compiledReference = this.compileDimensionReference(
                    p1,
                    tables,
                    dimension.table,
                );
                tablesReferences = new Set([
                    ...tablesReferences,
                    ...compiledReference.tablesReferences,
                ]);
                return compiledReference.sql;
            },
        );
        return {
            compiledSql,
            tablesReferences: Array.from(tablesReferences),
        };
    }

    compileCustomDimension(
        customDimension: CustomDimension,
        tables: Record<string, Table>,
    ): CompiledCustomDimension {
        if (isCustomBinDimension(customDimension)) {
            return customDimension;
        }

        const compiledCustomDimensionSql = this.compileCustomDimensionSql(
            customDimension,
            tables,
        );

        return {
            ...customDimension,
            ...compiledCustomDimensionSql,
        };
    }

    compileDimensionReference(
        ref: string,
        tables: Record<string, Table>,
        currentTable: string,
        joinAliases?: UncompiledExplore['joinAliases'],
    ): { sql: string; tablesReferences: Set<string> } {
        // Reference to current table
        if (ref === 'TABLE') {
            const fieldQuoteChar = getFieldQuoteChar(
                this.warehouseClient.credentials.type,
            );
            return {
                sql: `${fieldQuoteChar}${currentTable}${fieldQuoteChar}`,
                tablesReferences: new Set([currentTable]),
            };
        }
        const { refTable, refName } = getParsedReference(ref, currentTable);

        /** Resolve the table reference through its original name, or via an alias: */
        const referencedTable = getReferencedTable(
            refTable,
            tables,
            currentTable,
            joinAliases,
        );

        const referencedDimension = referencedTable?.dimensions[refName];

        if (referencedDimension === undefined) {
            throw new CompileError(
                `Model "${currentTable}" has a dimension reference: \${${ref}} which matches no dimension`,
                {},
            );
        }
        const compiledDimension = this.compileDimensionSql(
            referencedDimension,
            tables,
        );

        return {
            sql: `(${compiledDimension.sql})`,
            tablesReferences: new Set([
                referencedTable?.name || refTable,
                ...compiledDimension.tablesReferences,
            ]),
        };
    }

    compileMetricReference(
        ref: string,
        tables: Record<string, Table>,
        currentTable: string,
        joinAliases?: UncompiledExplore['joinAliases'],
    ): { sql: string; tablesReferences: Set<string> } {
        // Reference to current table
        if (ref === 'TABLE') {
            const fieldQuoteChar = getFieldQuoteChar(
                this.warehouseClient.credentials.type,
            );
            return {
                sql: `${fieldQuoteChar}${currentTable}${fieldQuoteChar}`,
                tablesReferences: new Set([currentTable]),
            };
        }
        const { refTable, refName } = getParsedReference(ref, currentTable);

        const referencedMetric = tables[refTable]?.metrics[refName];
        if (referencedMetric === undefined) {
            throw new CompileError(
                `Model "${currentTable}" has a metric reference: \${${ref}} which matches no metric`,
                {},
            );
        }

        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        const compiledMetric = this.compileMetricSql(
            referencedMetric,
            tables,
            joinAliases,
        );
        return {
            sql: `(${compiledMetric.sql})`,
            tablesReferences: new Set([
                refTable,
                ...compiledMetric.tablesReferences,
            ]),
        };
    }

    compileExploreJoinSql(
        join: ExploreJoin,
        tables: Record<string, Table>,
    ): string {
        // Sql join contains references to dimensions
        return join.sqlOn.replace(
            lightdashVariablePattern,
            (_, p1) =>
                this.compileDimensionReference(p1, tables, join.table).sql,
        );
    }

    compileJoin(
        join: ExploreJoin,
        tables: Record<string, Table>,
    ): CompiledExploreJoin {
        return {
            table: join.alias || join.table,
            sqlOn: join.sqlOn,
            type: join.type,
            compiledSqlOn: this.compileExploreJoinSql(
                {
                    table: join.alias || join.table,
                    sqlOn: join.sqlOn,
                    always: join.always,
                },
                tables,
            ),
            hidden: join.hidden,
            always: join.always,
        };
    }
}

export const createDimensionWithGranularity = (
    dimensionName: string,
    baseTimeDimension: CompiledDimension,
    explore: Explore,
    warehouseClient: WarehouseClient,
    granularity: DateGranularity,
) => {
    const newTimeInterval = dateGranularityToTimeFrameMap[granularity];
    const exploreCompiler = new ExploreCompiler(warehouseClient);
    return exploreCompiler.compileDimension(
        {
            ...baseTimeDimension,
            name: dimensionName,
            type: timeFrameConfigs[newTimeInterval].getDimensionType(
                baseTimeDimension.type,
            ),
            timeInterval: newTimeInterval,
            label: `${baseTimeDimension.label} ${timeFrameConfigs[
                newTimeInterval
            ]
                .getLabel()
                .toLowerCase()}`,
            sql: timeFrameConfigs[newTimeInterval].getSql(
                warehouseClient.getAdapterType(),
                newTimeInterval,
                baseTimeDimension.sql,
                timeFrameConfigs[newTimeInterval].getDimensionType(
                    baseTimeDimension.type,
                ),
                warehouseClient.getStartOfWeek(),
            ),
        },
        explore.tables,
    );
};
