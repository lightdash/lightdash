import { ParameterError } from '../types/errors';
import { type CompiledTable, type Explore } from '../types/explore';
import { type CustomDimension } from '../types/field';
import { type AdditionalMetric } from '../types/metricQuery';

/** The dbt YAML column that holds a field's definition once written back. */
export type WritebackColumn = {
    model: string;
    /** Dotted path of the column in the model's YAML. */
    column: string;
    /** `${TABLE}`-relative SQL of the base dimension, as the explore compiled it. */
    sql: string;
    /** The column is an array of scalars and the field is its element. */
    isScalarArrayElement: boolean;
};

const SCALAR_ELEMENT_SQL = '${TABLE}';

const getRootTable = (
    explore: Explore,
    table: CompiledTable,
): CompiledTable => {
    const parentName = table.nestedFrom?.parentTable;
    if (parentName === undefined) return table;
    const parent = explore.tables[parentName];
    if (!parent) {
        throw new ParameterError(
            `Table "${table.name}" is unnested from "${parentName}", which is not part of explore "${explore.name}"`,
        );
    }
    return getRootTable(explore, parent);
};

/**
 * Unnested tables are not dbt models: their leaves are dotted columns of the
 * model they were exploded from, so that is where a custom field is written.
 */
export const resolveWritebackColumn = (
    explore: Explore,
    tableName: string,
    dimensionName: string,
): WritebackColumn => {
    const table = explore.tables[tableName];
    if (!table) {
        throw new ParameterError(
            `Table "${tableName}" is not part of explore "${explore.name}"`,
        );
    }
    const dimension = table.dimensions[dimensionName];
    if (!dimension) {
        throw new ParameterError(
            `Dimension "${dimensionName}" not found in table "${tableName}"`,
        );
    }
    const root = getRootTable(explore, table);
    const model = root.originalName ?? root.name;
    if (!table.nestedFrom) {
        return {
            model,
            column: dimension.name,
            sql: dimension.sql,
            isScalarArrayElement: false,
        };
    }
    const { columnPath, offsetSql } = table.nestedFrom;
    if (dimension.sql === offsetSql) {
        throw new ParameterError(
            `"${dimension.name}" is the position of an element in "${columnPath}", not a column of model "${model}", so custom fields on it cannot be written back to dbt`,
        );
    }
    if (dimension.sql === SCALAR_ELEMENT_SQL) {
        return {
            model,
            column: columnPath,
            sql: dimension.sql,
            isScalarArrayElement: true,
        };
    }
    return {
        model,
        column: `${columnPath}.${dimension.name}`,
        sql: dimension.sql,
        isScalarArrayElement: false,
    };
};

export type CustomMetricWriteback = {
    metric: AdditionalMetric;
    column: WritebackColumn;
};

/** For a SQL dimension the column is the one that hosts the definition. */
export type CustomDimensionWriteback = {
    dimension: CustomDimension;
    column: WritebackColumn;
};
