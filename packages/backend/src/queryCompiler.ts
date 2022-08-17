import {
    AdditionalMetric,
    CompiledMetric,
    CompiledMetricQuery,
    CompiledTableCalculation,
    CompileError,
    compileMetricSql,
    convertAdditionalMetric,
    Explore,
    FieldId,
    getQuoteChar,
    lightdashVariablePattern,
    MetricQuery,
    TableCalculation,
} from '@lightdash/common';

const resolveQueryFieldReference = (ref: string): FieldId => {
    const parts = ref.split('.');
    if (parts.length !== 2) {
        throw new CompileError(
            `Table calculation contains an invalid reference: ${ref}. References must be of the format "table.field"`,
            {},
        );
    }
    const [tableName, fieldName] = parts;
    const fieldId = `${tableName}_${fieldName}`;

    return fieldId;
};

const compileTableCalculation = (
    tableCalculation: TableCalculation,
    validFieldIds: string[],
    quoteChar: string,
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
            const fieldId = resolveQueryFieldReference(p1);
            if (validFieldIds.includes(fieldId)) {
                return `${quoteChar}${fieldId}${quoteChar}`;
            }
            throw new CompileError(
                `Table calculation contains a reference ${p1} to a field that isn't included in the query.`,
                {},
            );
        },
    );
    return {
        ...tableCalculation,
        compiledSql,
    };
};

type CompileAdditionalMetricArgs = {
    additionalMetric: AdditionalMetric;
    explore: Pick<Explore, 'tables' | 'targetDatabase'>;
};
const compileAdditionalMetric = ({
    additionalMetric,
    explore,
}: CompileAdditionalMetricArgs): CompiledMetric => {
    const table = explore.tables[additionalMetric.table];
    if (table === undefined) {
        throw new CompileError(
            `Custom metric "${additionalMetric.name}" references a table that doesn't exist "${additionalMetric.table}"`,
            {},
        );
    }
    const quoteChar = getQuoteChar(explore.targetDatabase); // quote char

    const metric = convertAdditionalMetric({ additionalMetric, table });
    const compiledMetric = compileMetricSql(metric, explore.tables, quoteChar);
    return {
        ...metric,
        compiledSql: compiledMetric.sql,
        tablesReferences: Array.from(compiledMetric.tablesReferences),
    };
};

type CompileMetricQueryArgs = {
    explore: Pick<Explore, 'targetDatabase' | 'tables'>;
    metricQuery: MetricQuery;
};
export const compileMetricQuery = ({
    explore,
    metricQuery,
}: CompileMetricQueryArgs): CompiledMetricQuery => {
    const quoteChar = getQuoteChar(explore.targetDatabase);
    const compiledTableCalculations = metricQuery.tableCalculations.map(
        (tableCalculation) =>
            compileTableCalculation(
                tableCalculation,
                [...metricQuery.dimensions, ...metricQuery.metrics],
                quoteChar,
            ),
    );
    const compiledAdditionalMetrics = (metricQuery.additionalMetrics || []).map(
        (additionalMetric) =>
            compileAdditionalMetric({ additionalMetric, explore }),
    );
    return {
        ...metricQuery,
        compiledTableCalculations,
        compiledAdditionalMetrics,
    };
};
