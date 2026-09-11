import { intersection } from 'lodash';
import { CompileError } from '../types/errors';
import {
    InlineErrorType,
    JoinRelationship,
    type CompiledExploreJoin,
    type CompiledTable,
    type Explore,
} from '../types/explore';
import { MetricType } from '../types/field';
import { parseAllReferences } from './exploreCompiler';

export type FindTablesWithMetricInflationArgs = {
    tables: {
        [tableName: string]: Pick<CompiledTable, 'primaryKey' | 'nestedFrom'>;
    };
    /** Every join the explore defines. */
    possibleJoins: Explore['joinedTables'];
    baseTable: Explore['baseTable'];
    /** Tables the query actually joins. */
    joinedTables: Set<string>;
    warnings?: Explore['warnings'];
};

/*
 * Returns list of intermediary/extra joined tables based on the current joined tables
 */
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
                const joinTableReferences =
                    joinedTable.tablesReferences ||
                    parseAllReferences(
                        // fallback for old explores, it might be incorrect when the join as an alias
                        joinedTable.sqlOn,
                        joinedTable.table,
                    ).map(({ refTable }) => refTable);

                const newReferencesInJoin = joinTableReferences.reduce<
                    string[]
                >(
                    (acc, refTable) =>
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
export const isInflationProofMetric = (metricType: MetricType): boolean =>
    [
        MetricType.COUNT_DISTINCT,
        MetricType.SUM_DISTINCT,
        MetricType.AVERAGE_DISTINCT,
        MetricType.MIN,
        MetricType.MAX,
    ].includes(metricType);

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

export const findTablesWithMetricInflation = ({
    baseTable,
    joinedTables,
    possibleJoins,
    tables,
    warnings,
}: FindTablesWithMetricInflationArgs): {
    tablesWithMetricInflation: Set<string>;
    joinWithoutRelationship: Set<string>;
    tablesWithoutPrimaryKey: Set<string>;
} => {
    const tablesWithMetricInflation = new Set<string>();
    const joinWithoutRelationship = new Set<string>();
    const tablesWithoutPrimaryKey = new Set<string>();

    const missingJoin = [...joinedTables].find(
        (table) =>
            table !== baseTable &&
            !possibleJoins.some((join) => join.table === table),
    );
    if (missingJoin) {
        const joinWarnings = (warnings ?? []).filter(
            ({ type }) =>
                type === InlineErrorType.MISSING_TABLE ||
                type === InlineErrorType.SKIPPED_JOIN,
        );
        throw new CompileError(
            `Join "${missingJoin}" is not available for base table "${baseTable}". Check the model's compilation warnings and the project's tags/selector, then refresh the project.${
                joinWarnings.length > 0
                    ? ` Join compilation warnings: ${joinWarnings.map(({ message }) => message).join(' ')}`
                    : ''
            }`,
        );
    }

    // Check if any join has a many-to-many relationship
    const hasManyToManyJoin = Array.from(joinedTables).some((joinedTable) => {
        if (joinedTable === baseTable) return false;

        const join = possibleJoins.find(
            (possibleJoin) => possibleJoin.table === joinedTable,
        );
        return join?.relationship === JoinRelationship.MANY_TO_MANY;
    });

    // If there's a many-to-many join, all tables (including base table) have inflation
    if (hasManyToManyJoin) {
        joinedTables.forEach(
            tablesWithMetricInflation.add.bind(tablesWithMetricInflation),
        );
        // Also add the base table
        tablesWithMetricInflation.add(baseTable);
    } else {
        joinedTables.forEach((joinedTable) => {
            if (
                !tables[joinedTable]?.primaryKey &&
                !tables[joinedTable]?.nestedFrom
            ) {
                // Warn the user about missing primary key so we can detect possible metric inflation
                tablesWithoutPrimaryKey.add(joinedTable);
            }

            if (joinedTable === baseTable) {
                // skip base table
                return;
            }

            // All query joins were validated above.
            const join = possibleJoins.find(
                (possibleJoin) => possibleJoin.table === joinedTable,
            )!;
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
                const chainedTablesWithInflation =
                    findChainedOneToOneTableJoins({
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
    }

    return {
        tablesWithMetricInflation,
        joinWithoutRelationship,
        tablesWithoutPrimaryKey,
    };
};
