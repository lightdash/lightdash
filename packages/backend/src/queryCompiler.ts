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

const compileTableCalculation = (
    tableCalculation: TableCalculation,
    validFieldIds: string[],
    quoteChar: string,
    compiledTableCalculations: Map<
        string,
        CompiledTableCalculation
    > = new Map(),
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
                const referencedTableCalc = compiledTableCalculations.get(p1)!;
                // Wrap the referenced table calculation SQL in parentheses to preserve precedence
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
    // Build dependency graph to check for circular dependencies
    const dependencyGraph =
        buildTableCalculationDependencyGraph(tableCalculations);
    detectCircularDependencies(dependencyGraph);

    const compiledTableCalculations: CompiledTableCalculation[] = [];

    // Create a map to track compiled table calculations. We'll go through the
    // dependency graph first, then add any table calculations that weren't in it.
    const compiledTableCalcMap = new Map<string, CompiledTableCalculation>();

    // Sort them so we compile them in the correct order
    const sortedTableCalcNames = sortTableCalcs(dependencyGraph);
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
            );
            compiledTableCalcMap.set(calcName, compiled);
            compiledTableCalculations.push(compiled);
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
