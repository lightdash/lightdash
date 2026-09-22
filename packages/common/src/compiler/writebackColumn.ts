import { ParameterError } from '../types/errors';
import { type CompiledTable, type Explore } from '../types/explore';
import {
    isCustomBinDimension,
    type CompiledDimension,
    type CustomDimension,
} from '../types/field';
import { type AdditionalMetric } from '../types/metricQuery';
import { getItemId } from '../utils/item';
import { parseAllReferences } from './exploreCompiler';

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

export type CustomMetricWriteback = {
    metric: AdditionalMetric;
    column: WritebackColumn;
};

/** For a SQL dimension the column is the one that hosts the definition. */
export type CustomDimensionWriteback = {
    dimension: CustomDimension;
    column: WritebackColumn;
};

const SCALAR_ELEMENT_SQL = '${TABLE}';
const ELEMENT_POSITION_NAME = 'offset';

export const getWritebackTable = (
    explore: Explore,
    tableName: string,
): CompiledTable => {
    const table = explore.tables[tableName];
    if (!table) {
        throw new ParameterError(
            `Table "${tableName}" is not part of explore "${explore.name}"`,
        );
    }
    return table;
};

// The element position is synthesized when a repeated column is unnested and
// shadows any leaf of that name, so on an unnested table the name is exact.
const isElementPosition = (
    table: CompiledTable,
    dimension: CompiledDimension,
) => table.nestedFrom !== undefined && dimension.name === ELEMENT_POSITION_NAME;

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
    const table = getWritebackTable(explore, tableName);
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
    const { columnPath } = table.nestedFrom;
    if (isElementPosition(table, dimension)) {
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

export const resolveCustomMetricWritebackColumn = (
    explore: Explore,
    metric: AdditionalMetric,
): WritebackColumn => {
    if (metric.baseDimensionName === undefined) {
        throw new ParameterError(
            `Metric ${metric.name} cannot be written back. Only metrics based on a dimension are supported; metrics without a base dimension are not.`,
        );
    }
    return resolveWritebackColumn(
        explore,
        metric.table,
        metric.baseDimensionName,
    );
};

/**
 * A bin is written on its base column. A SQL dimension stays on its own table:
 * it is written on the first column of that table its SQL references, or on
 * the table's first column when it only references other tables.
 */
export const resolveCustomDimensionWritebackColumn = (
    explore: Explore,
    dimension: CustomDimension,
): WritebackColumn => {
    const table = getWritebackTable(explore, dimension.table);
    if (isCustomBinDimension(dimension)) {
        const base = Object.values(table.dimensions).find(
            (candidate) => getItemId(candidate) === dimension.dimensionId,
        );
        if (!base) {
            throw new ParameterError(
                `Dimension "${dimension.dimensionId}" not found in table "${dimension.table}"`,
            );
        }
        return resolveWritebackColumn(explore, dimension.table, base.name);
    }
    const isHostCandidate = (candidate: CompiledDimension) =>
        !candidate.isAdditionalDimension &&
        !isElementPosition(table, candidate);
    const referenced = parseAllReferences(dimension.sql, dimension.table)
        .filter(({ refTable }) => refTable === dimension.table)
        .map(({ refName }) => table.dimensions[refName])
        .find(
            (candidate) =>
                candidate !== undefined && isHostCandidate(candidate),
        );
    const host =
        referenced ??
        Object.values(table.dimensions)
            .filter(isHostCandidate)
            .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))[0];
    if (!host) {
        throw new ParameterError(
            `No columns found in table "${dimension.table}" to hold custom dimension ${dimension.name}`,
        );
    }
    return resolveWritebackColumn(explore, dimension.table, host.name);
};
