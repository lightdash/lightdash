import {
    AdditionalMetric,
    assertUnreachable,
    CompiledMetric,
    CompiledMetricQuery,
    CompiledTableCalculation,
    CompileError,
    convertAdditionalMetric,
    convertFieldRefToFieldId,
    DependencyNode,
    detectCircularDependencies,
    Explore,
    ExploreCompiler,
    isPostCalculationMetricType,
    isSqlTableCalculation,
    isTemplateTableCalculation,
    lightdashVariablePattern,
    MetricQuery,
    MetricType,
    PivotConfiguration,
    POP_PREVIOUS_PERIOD_SUFFIX,
    TableCalculation,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { compileTableCalculationFromTemplate } from './tableCalculationTemplateQueryCompiler';

const getTableCalculationReferences = (sql: string): string[] => {
    const matches = sql.match(lightdashVariablePattern) || [];
    return matches.map((match) => match.slice(2, -1)); // Remove ${ and }
};

const buildTableCalculationDependencyGraph = (
    tableCalculations: TableCalculation[],
): DependencyNode[] =>
    tableCalculations.map((calc) => {
        if (isSqlTableCalculation(calc)) {
            return {
                name: calc.name,
                dependencies: getTableCalculationReferences(calc.sql),
            };
        }

        if (isTemplateTableCalculation(calc)) {
            const fieldIdDependency =
                'fieldId' in calc.template && calc.template.fieldId !== null
                    ? [calc.template.fieldId]
                    : [];

            const orderByFields =
                'orderBy' in calc.template
                    ? calc.template.orderBy.map((ob) => ob.fieldId)
                    : [];

            const partitionByFields =
                'partitionBy' in calc.template && calc.template.partitionBy
                    ? calc.template.partitionBy
                    : [];

            return {
                name: calc.name,
                dependencies: [
                    ...fieldIdDependency,
                    ...orderByFields,
                    ...partitionByFields,
                ],
            };
        }

        throw new CompileError(`Table calculation has no SQL or template`, {});
    });

const compileTableCalculation = (
    tableCalculation: TableCalculation,
    validFieldIds: string[],
    quoteChar: string,
    dependencyGraph: DependencyNode[],
    warehouseSqlBuilder: WarehouseSqlBuilder,
    sortFields: MetricQuery['sorts'],
): CompiledTableCalculation => {
    if (validFieldIds.includes(tableCalculation.name)) {
        throw new CompileError(
            `Table calculation has a name that already exists in the query: ${tableCalculation.name}`,
            {},
        );
    }

    // Find dependencies for this table calculation
    const tableDep = dependencyGraph.find(
        (dep) => dep.name === tableCalculation.name,
    );
    const tableCalcDependencies = tableDep
        ? tableDep.dependencies.filter((dep) =>
              dependencyGraph.some((d) => d.name === dep),
          )
        : [];

    if (isSqlTableCalculation(tableCalculation)) {
        const compiledSql = tableCalculation.sql.replace(
            lightdashVariablePattern,
            (_, p1) => {
                // Check if this is a reference to another table calculation
                if (dependencyGraph.some((dep) => dep.name === p1)) {
                    // For table calc references, we'll leave them as placeholders
                    // MetricQueryBuilder will resolve these with proper CTE references
                    return `${quoteChar}${p1}${quoteChar}`;
                }

                // If the field is already valid, return it
                if (validFieldIds.includes(p1)) {
                    return `${quoteChar}${p1}${quoteChar}`;
                }

                // Otherwise, try to convert it as a field reference (table.field format)
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
            dependsOn: tableCalcDependencies,
        };
    }

    if (isTemplateTableCalculation(tableCalculation)) {
        const compiledSql = compileTableCalculationFromTemplate(
            tableCalculation.template,
            warehouseSqlBuilder,
            sortFields,
        );

        return {
            ...tableCalculation,
            compiledSql,
            dependsOn: tableCalcDependencies,
        };
    }

    throw new CompileError(`Table calculation has no SQL or template`, {});
};

const compileTableCalculations = (
    tableCalculations: TableCalculation[],
    validFieldIds: string[],
    quoteChar: string,
    warehouseSqlBuilder: WarehouseSqlBuilder,
    sortFields: MetricQuery['sorts'],
): CompiledTableCalculation[] => {
    if (tableCalculations.length === 0) {
        return [];
    }

    // Build dependency graph to check for circular dependencies
    const dependencyGraph =
        buildTableCalculationDependencyGraph(tableCalculations);
    try {
        detectCircularDependencies(dependencyGraph, 'table calculations');
    } catch (e) {
        throw new CompileError(e instanceof Error ? e.message : String(e), {});
    }

    const compiledTableCalculations: CompiledTableCalculation[] = [];

    for (const tableCalculation of tableCalculations) {
        const compiled = compileTableCalculation(
            tableCalculation,
            validFieldIds,
            quoteChar,
            dependencyGraph,
            warehouseSqlBuilder,
            sortFields,
        );
        compiledTableCalculations.push(compiled);
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

export function compilePostCalculationMetric({
    warehouseSqlBuilder,
    type,
    sql,
    pivotConfiguration,
    orderByClause,
}: {
    warehouseSqlBuilder: WarehouseSqlBuilder;
    type: MetricType;
    sql: string;
    pivotConfiguration?: PivotConfiguration;
    orderByClause?: string;
}): string {
    const floatType = warehouseSqlBuilder.getFloatingType();
    if (!isPostCalculationMetricType(type)) {
        throw new CompileError(
            `Unexpected metric type '${type}' when compiling PostCalculation metric`,
        );
    }

    const groupByColumns = pivotConfiguration?.groupByColumns ?? [];
    const q = warehouseSqlBuilder.getFieldQuoteChar();
    const partitionByClause: string | undefined =
        groupByColumns.length > 0
            ? `PARTITION BY ${groupByColumns
                  .map((col) => `${q}${col.reference}${q}`)
                  .join(', ')}`
            : undefined;

    const finalOrderByClause = orderByClause ?? `ORDER BY (SELECT NULL)`;

    if (type === MetricType.RUNNING_TOTAL) {
        return `SUM(${sql}) OVER (${
            partitionByClause ?? ' '
        }${finalOrderByClause} ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`;
    }

    if (type === MetricType.PERCENT_OF_PREVIOUS) {
        return (
            `(CAST(${sql} AS ${floatType}) / ` +
            `CAST(NULLIF(LAG(${sql}) OVER(${
                partitionByClause ?? ' '
            }${finalOrderByClause}), 0) AS ${floatType})) - 1`
        );
    }

    if (type === MetricType.PERCENT_OF_TOTAL) {
        return (
            `(CAST(${sql} AS ${floatType}) / ` +
            `CAST(NULLIF(SUM(${sql}) OVER(${
                partitionByClause ?? ''
            }), 0) AS ${floatType}))`
        );
    }

    throw new CompileError(
        `No PostCalculation metric implementation for type ${type}`,
    );
}

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

    const validFieldIds = [
        ...metricQuery.dimensions,
        ...metricQuery.metrics.reduce<string[]>((acc2, metric) => {
            acc2.push(metric);
            if (metricQuery.periodOverPeriod) {
                acc2.push(`${metric}${POP_PREVIOUS_PERIOD_SUFFIX}`);
            }
            return acc2;
        }, []),
    ];

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

    const compiledTableCalculations = compileTableCalculations(
        metricQuery.tableCalculations,
        validFieldIds,
        fieldQuoteChar,
        warehouseSqlBuilder,
        metricQuery.sorts,
    );

    return {
        ...metricQuery,
        compiledTableCalculations,
        compiledAdditionalMetrics,
        compiledCustomDimensions,
    };
};
