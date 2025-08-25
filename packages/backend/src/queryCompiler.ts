import {
    AdditionalMetric,
    CompiledMetric,
    CompiledMetricQuery,
    CompiledTableCalculation,
    CompileError,
    convertAdditionalMetric,
    convertFieldRefToFieldId,
    Explore,
    ExploreCompiler,
    getFieldQuoteChar,
    lightdashVariablePattern,
    MetricQuery,
    TableCalculation,
    WarehouseClient,
    type WarehouseSqlBuilder,
} from '@lightdash/common';

interface TableCalculationDependency {
    name: string;
    dependencies: string[];
}

const getTableCalculationReferences = (sql: string): string[] => {
    const matches = sql.match(lightdashVariablePattern) || [];
    return matches.map((match) => match.slice(2, -1)); // Remove ${ and }
};

const buildTableCalculationDependencyGraph = (
    tableCalculations: TableCalculation[],
): TableCalculationDependency[] =>
    tableCalculations.map((calc) => ({
        name: calc.name,
        dependencies: getTableCalculationReferences(calc.sql),
    }));

const detectCircularDependencies = (
    dependencies: TableCalculationDependency[],
): void => {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (node: string, path: string[]): void => {
        if (recursionStack.has(node)) {
            throw new CompileError(
                `Circular dependency detected in table calculations: ${[
                    ...path,
                    node,
                ].join(' -> ')}`,
                {},
            );
        }

        if (visited.has(node)) {
            return;
        }

        visited.add(node);
        recursionStack.add(node);

        const deps =
            dependencies.find((d) => d.name === node)?.dependencies || [];
        for (const dep of deps) {
            // Only check dependencies that are table calculations
            if (dependencies.some((d) => d.name === dep)) {
                dfs(dep, [...path, node]);
            }
        }

        recursionStack.delete(node);
    };

    for (const dep of dependencies) {
        if (!visited.has(dep.name)) {
            dfs(dep.name, []);
        }
    }
};

const sortTableCalcs = (
    dependencyGraph: TableCalculationDependency[],
): string[] => {
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    // Initialize
    for (const dep of dependencyGraph) {
        inDegree.set(dep.name, 0);
        adjList.set(dep.name, []);
    }

    // Build adjacency list and in-degree count
    for (const dep of dependencyGraph) {
        for (const dependency of dep.dependencies) {
            // Only consider dependencies that are table calculations
            if (dependencyGraph.some((d) => d.name === dependency)) {
                if (!adjList.has(dependency)) {
                    adjList.set(dependency, []);
                }
                adjList.get(dependency)!.push(dep.name);
                inDegree.set(dep.name, (inDegree.get(dep.name) || 0) + 1);
            }
        }
    }

    // Topological sort using Kahn's algorithm
    const queue: string[] = [];
    const result: string[] = [];

    inDegree.forEach((degree, node) => {
        if (degree === 0) {
            queue.push(node);
        }
    });

    while (queue.length > 0) {
        const current = queue.shift()!;
        result.push(current);

        for (const neighbor of adjList.get(current) || []) {
            const newDegree = inDegree.get(neighbor)! - 1;
            inDegree.set(neighbor, newDegree);
            if (newDegree === 0) {
                queue.push(neighbor);
            }
        }
    }

    return result;
};

const findMostRecentCteContaining = (
    tableCalcName: string,
    cteOrder: string[],
    cteNames: Map<string, string>,
    currentIndex: number,
): string => {
    // Find the most recent CTE (before current) that contains this table calc
    // We work backwards from the current position
    for (let i = currentIndex - 1; i >= 0; i -= 1) {
        const calcName = cteOrder[i];
        if (cteNames.has(calcName) && calcName === tableCalcName) {
            // Found the table calc, now find the most recent CTE that contains it
            // Since each CTE includes all previous calculations, any CTE after this one
            // (but before current) will contain it
            for (let j = currentIndex - 1; j >= i; j -= 1) {
                const candidateName = cteOrder[j];
                if (cteNames.has(candidateName)) {
                    return cteNames.get(candidateName)!;
                }
            }
            // Fallback to the table calc's own CTE
            return cteNames.get(calcName)!;
        }
    }

    // If not found in order, return its own CTE name
    return cteNames.get(tableCalcName) || `tc_${tableCalcName}`;
};

const compileTableCalculation = (
    tableCalculation: TableCalculation,
    validFieldIds: string[],
    quoteChar: string,
    compiledTableCalculations: Map<
        string,
        CompiledTableCalculation
    > = new Map(),
    cteNames: Map<string, string> = new Map(),
    cteOrder: string[] = [], // Order of CTEs to find most recent one containing a column
): CompiledTableCalculation => {
    if (validFieldIds.includes(tableCalculation.name)) {
        throw new CompileError(
            `Table calculation has a name that already exists in the query: ${tableCalculation.name}`,
            {},
        );
    }

    const compiledSql = tableCalculation.sql.replace(
        lightdashVariablePattern,
        (_, p1) => {
            // Check if this is a reference to another table calculation
            if (compiledTableCalculations.has(p1)) {
                // If this table calc has a CTE, reference it from the most recent CTE that contains it
                if (cteNames.has(p1)) {
                    // Find the most recent CTE that contains this table calculation
                    const currentIndex = cteOrder.indexOf(
                        tableCalculation.name,
                    );
                    const mostRecentCte = findMostRecentCteContaining(
                        p1,
                        cteOrder,
                        cteNames,
                        currentIndex,
                    );
                    return `${mostRecentCte}.${quoteChar}${p1}${quoteChar}`;
                }
                // Otherwise, inline the calculation (for simple cases without dependencies)
                const referencedTableCalc = compiledTableCalculations.get(p1)!;
                return `(${referencedTableCalc.compiledSql})`;
            }

            // Otherwise, treat it as a field reference
            const fieldId = convertFieldRefToFieldId(p1);
            if (validFieldIds.includes(fieldId)) {
                return `${quoteChar}${fieldId}${quoteChar}`;
            }

            throw new CompileError(
                `Table calculation contains a reference "${p1}" to a field or table calculation that isn't included in the query.`,
                {},
            );
        },
    );

    return {
        ...tableCalculation,
        compiledSql,
    };
};

const compileTableCalculations = (
    tableCalculations: TableCalculation[],
    validFieldIds: string[],
    quoteChar: string,
): CompiledTableCalculation[] => {
    if (tableCalculations.length === 0) {
        return [];
    }

    // Build dependency graph to check for circular dependencies
    const dependencyGraph =
        buildTableCalculationDependencyGraph(tableCalculations);
    detectCircularDependencies(dependencyGraph);

    const compiledTableCalculations: CompiledTableCalculation[] = [];
    const compiledTableCalcMap = new Map<string, CompiledTableCalculation>();
    const cteNames = new Map<string, string>(); // Map of table calc name to CTE name

    // Sort them so we compile them in the correct order
    const sortedTableCalcNames = sortTableCalcs(dependencyGraph);

    // Determine which table calculations need CTEs (have dependencies on other table calcs)
    const tableCalcsNeedingCtes = new Set<string>();
    for (const dependency of dependencyGraph) {
        const hasTableCalcDependencies = dependency.dependencies.some((dep) =>
            dependencyGraph.some((d) => d.name === dep),
        );
        if (hasTableCalcDependencies) {
            tableCalcsNeedingCtes.add(dependency.name);
            // Also mark dependencies as needing CTEs
            dependency.dependencies.forEach((dep) => {
                if (dependencyGraph.some((d) => d.name === dep)) {
                    tableCalcsNeedingCtes.add(dep);
                }
            });
        }
    }

    let currentCteAlias = 'metrics'; // Start with base metrics CTE

    for (const calcName of sortedTableCalcNames) {
        const tableCalculation = tableCalculations.find(
            (tc) => tc.name === calcName,
        );
        if (tableCalculation) {
            const compiled = compileTableCalculation(
                tableCalculation,
                validFieldIds,
                quoteChar,
                compiledTableCalcMap,
                cteNames,
                sortedTableCalcNames, // Pass the order array
            );
            compiledTableCalcMap.set(calcName, compiled);
            compiledTableCalculations.push(compiled);

            // If this table calc needs a CTE, create one and attach it to the compiled table calculation
            if (tableCalcsNeedingCtes.has(calcName)) {
                const cteName = `tc_${calcName}`;
                cteNames.set(calcName, cteName);

                // Create CTE that extends the previous CTE
                const selectColumns = [
                    '*',
                    `  ${compiled.compiledSql} AS ${quoteChar}${calcName}${quoteChar}`,
                ];
                const cteDefinition = `${cteName} AS (\n  SELECT\n${selectColumns.join(
                    ',\n',
                )}\n  FROM ${currentCteAlias}\n)`;

                // Attach CTE to the compiled table calculation
                compiled.cte = cteDefinition;
                currentCteAlias = cteName;
            }
        }
    }

    // Add any table calculations that weren't in the dependency graph (no dependencies or references)
    for (const tableCalculation of tableCalculations) {
        if (!compiledTableCalcMap.has(tableCalculation.name)) {
            const compiled = compileTableCalculation(
                tableCalculation,
                validFieldIds,
                quoteChar,
                compiledTableCalcMap,
                cteNames,
                sortedTableCalcNames,
            );
            compiledTableCalcMap.set(tableCalculation.name, compiled);
            compiledTableCalculations.push(compiled);
        }
    }

    return compiledTableCalculations;
};

type CompileAdditionalMetricArgs = {
    additionalMetric: AdditionalMetric;
    explore: Pick<Explore, 'tables' | 'targetDatabase'>;
    warehouseSqlBuilder: WarehouseSqlBuilder;
    availableParameters: string[];
};
const compileAdditionalMetric = ({
    additionalMetric,
    explore,
    warehouseSqlBuilder,
    availableParameters,
}: CompileAdditionalMetricArgs): CompiledMetric => {
    const table = explore.tables[additionalMetric.table];
    if (table === undefined) {
        throw new CompileError(
            `Custom metric "${additionalMetric.name}" references a table that doesn't exist "${additionalMetric.table}"`,
            {},
        );
    }
    const exploreCompiler = new ExploreCompiler(warehouseSqlBuilder);

    const metric = convertAdditionalMetric({ additionalMetric, table });
    const compiledMetric = exploreCompiler.compileMetricSql(
        metric,
        explore.tables,
        availableParameters,
    );
    return {
        ...metric,
        compiledSql: compiledMetric.sql,
        tablesReferences: Array.from(compiledMetric.tablesReferences),
    };
};

type CompileMetricQueryArgs = {
    explore: Pick<Explore, 'targetDatabase' | 'tables' | 'parameters'>;
    metricQuery: MetricQuery;
    warehouseSqlBuilder: WarehouseSqlBuilder;
    availableParameters: string[];
};
export const compileMetricQuery = ({
    explore,
    metricQuery,
    warehouseSqlBuilder,
    availableParameters,
}: CompileMetricQueryArgs): CompiledMetricQuery => {
    const fieldQuoteChar = warehouseSqlBuilder.getFieldQuoteChar();
    const validFieldIds = [...metricQuery.dimensions, ...metricQuery.metrics];

    const compiledTableCalculations = compileTableCalculations(
        metricQuery.tableCalculations,
        validFieldIds,
        fieldQuoteChar,
    );
    const compiledAdditionalMetrics = (metricQuery.additionalMetrics || []).map(
        (additionalMetric) =>
            compileAdditionalMetric({
                additionalMetric,
                explore,
                warehouseSqlBuilder,
                availableParameters,
            }),
    );

    const compiler = new ExploreCompiler(warehouseSqlBuilder);
    const compiledCustomDimensions = (metricQuery.customDimensions || []).map(
        (customDimension) =>
            compiler.compileCustomDimension(
                customDimension,
                explore.tables,
                availableParameters,
            ),
    );

    return {
        ...metricQuery,
        compiledTableCalculations,
        compiledAdditionalMetrics,
        compiledCustomDimensions,
    };
};
