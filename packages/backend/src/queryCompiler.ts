import {
    CompiledMetricQuery,
    CompiledTableCalculation,
    FieldId,
    MetricQuery,
    TableCalculation,
} from 'common';
import { CompileError } from './errors';
import { lightdashVariablePattern } from './exploreCompiler';
import { getQuoteChar } from './queryBuilder';

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
    targetDatabase: string,
    tableCalculation: TableCalculation,
    validFieldIds: string[],
): CompiledTableCalculation => {
    const q = getQuoteChar(targetDatabase); // quote char
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
                return `${q}fieldId${q}`;
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

// TODO: independent of quote char behaviour - should depend on database target
export const compileMetricQuery = (
    targetDatabase: string,
    metricQuery: MetricQuery,
): CompiledMetricQuery => {
    const compiledTableCalculations = metricQuery.tableCalculations.map(
        (tableCalculation) =>
            compileTableCalculation(targetDatabase, tableCalculation, [
                ...metricQuery.dimensions,
                ...metricQuery.metrics,
            ]),
    );
    return {
        ...metricQuery,
        compiledTableCalculations,
    };
};
