import {
    AdditionalMetric,
    assertUnreachable,
    CompiledMetric,
    CompiledMetricQuery,
    CompiledTableCalculation,
    CompileError,
    convertAdditionalMetric,
    convertFieldRefToFieldId,
    Explore,
    ExploreCompiler,
    isSpreadsheetFormulaTableCalculation,
    isSqlTableCalculation,
    isTemplateTableCalculation,
    lightdashVariablePattern,
    MetricQuery,
    TableCalculation,
    TableCalculationTemplate,
    TableCalculationTemplateType,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { compileSpreadsheetFormula } from './compiler/spreadsheetFormulaCompiler';

interface TableCalculationDependency {
    name: string;
    dependencies: string[];
}

const compileTableCalculationFromTemplate = (
    template: TableCalculationTemplate,
    warehouseSqlBuilder: WarehouseSqlBuilder,
): string => {
    const quoteChar = warehouseSqlBuilder.getFieldQuoteChar();
    const floatType = warehouseSqlBuilder.getFloatingType();
    const quotedFieldId = `${quoteChar}${template.fieldId}${quoteChar}`;

    // Build ORDER BY clause if needed
    const buildOrderByClause = (
        calcTemplate: TableCalculationTemplate,
    ): string => {
        if (!('orderBy' in calcTemplate)) return '';

        const { orderBy } = calcTemplate;
        if (!orderBy || orderBy.length === 0) return '';

        const orderClauses = orderBy
            .map((ob) =>
                ob.order
                    ? `${quoteChar}${
                          ob.fieldId
                      }${quoteChar} ${ob.order.toUpperCase()}`
                    : `${quoteChar}${ob.fieldId}${quoteChar}`,
            )
            .join(', ');

        return `ORDER BY ${orderClauses} `;
    };

    const orderByClause = buildOrderByClause(template);
    const templateType = template.type;
    switch (templateType) {
        case TableCalculationTemplateType.PERCENT_CHANGE_FROM_PREVIOUS: {
            return (
                `(CAST(${quotedFieldId} AS ${floatType}) / ` +
                `CAST(NULLIF(LAG(${quotedFieldId}) OVER(${orderByClause}), 0) AS ${floatType})) - 1`
            );
        }

        case TableCalculationTemplateType.PERCENT_OF_PREVIOUS_VALUE: {
            return (
                `(CAST(${quotedFieldId} AS ${floatType}) / ` +
                `CAST(NULLIF(LAG(${quotedFieldId}) OVER(${orderByClause}), 0) AS ${floatType}))`
            );
        }

        case TableCalculationTemplateType.PERCENT_OF_COLUMN_TOTAL:
            return (
                `(CAST(${quotedFieldId} AS ${floatType}) / ` +
                `CAST(NULLIF(SUM(${quotedFieldId}) OVER(), 0) AS ${floatType}))`
            );

        case TableCalculationTemplateType.RANK_IN_COLUMN:
            return `RANK() OVER (ORDER BY ${quotedFieldId} ASC)`;

        case TableCalculationTemplateType.RUNNING_TOTAL: {
            return `SUM(${quotedFieldId}) OVER (ORDER BY ${quotedFieldId} DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`;
        }

        default:
            return assertUnreachable(
                templateType,
                `Unknown table calculation template type`,
            );
    }
};

const getTableCalculationReferences = (sql: string): string[] => {
    const matches = sql.match(lightdashVariablePattern) || [];
    return matches.map((match) => match.slice(2, -1)); // Remove ${ and }
};

const buildTableCalculationDependencyGraph = (
    tableCalculations: TableCalculation[],
): TableCalculationDependency[] =>
    tableCalculations.map((calc) => {
        if (isSqlTableCalculation(calc)) {
            return {
                name: calc.name,
                dependencies: getTableCalculationReferences(calc.sql),
            };
        }

        if (isTemplateTableCalculation(calc)) {
            const orderByFields =
                'orderBy' in calc.template
                    ? calc.template.orderBy.map((ob) => ob.fieldId)
                    : [];

            return {
                name: calc.name,
                dependencies: [calc.template.fieldId, ...orderByFields],
            };
        }

        if (isSpreadsheetFormulaTableCalculation(calc)) {
            return {
                name: calc.name,
                dependencies: [], // Stage 1: no field references yet
            };
        }

        throw new CompileError(
            `Table calculation has no SQL, template, or spreadsheet formula`,
            {},
        );
    });

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

const compileTableCalculation = (
    tableCalculation: TableCalculation,
    validFieldIds: string[],
    quoteChar: string,
    dependencyGraph: TableCalculationDependency[],
    warehouseSqlBuilder: WarehouseSqlBuilder,
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
        );

        return {
            ...tableCalculation,
            compiledSql,
            dependsOn: tableCalcDependencies,
        };
    }

    if (isSpreadsheetFormulaTableCalculation(tableCalculation)) {
        const compiledSql = compileSpreadsheetFormula(
            tableCalculation.spreadsheetFormula,
            warehouseSqlBuilder,
        );

        return {
            ...tableCalculation,
            compiledSql,
            dependsOn: tableCalcDependencies,
        };
    }

    throw new CompileError(
        `Table calculation has no SQL, template, or spreadsheet formula`,
        {},
    );
};

const compileTableCalculations = (
    tableCalculations: TableCalculation[],
    validFieldIds: string[],
    quoteChar: string,
    warehouseSqlBuilder: WarehouseSqlBuilder,
): CompiledTableCalculation[] => {
    if (tableCalculations.length === 0) {
        return [];
    }

    // Build dependency graph to check for circular dependencies
    const dependencyGraph =
        buildTableCalculationDependencyGraph(tableCalculations);
    detectCircularDependencies(dependencyGraph);

    const compiledTableCalculations: CompiledTableCalculation[] = [];

    for (const tableCalculation of tableCalculations) {
        const compiled = compileTableCalculation(
            tableCalculation,
            validFieldIds,
            quoteChar,
            dependencyGraph,
            warehouseSqlBuilder,
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
    );

    return {
        ...metricQuery,
        compiledTableCalculations,
        compiledAdditionalMetrics,
        compiledCustomDimensions,
    };
};
