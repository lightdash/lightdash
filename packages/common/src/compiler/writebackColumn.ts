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
    column: string;
    /** `${TABLE}`-relative SQL of the base dimension, as the explore compiled it. */
    sql: string;
    isScalarArrayElement: boolean;
};

export type Writeback<T> = { field: T; column: WritebackColumn };
export type CustomMetricWriteback = Writeback<AdditionalMetric>;
export type CustomDimensionWriteback = Writeback<CustomDimension>;

const SCALAR_ELEMENT_NAME = 'value';
const SCALAR_ELEMENT_SQL = '${TABLE}';
const ELEMENT_POSITION_NAME = 'offset';

const getWritebackTable = (
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

// Routed leaves never carry custom SQL, so `${TABLE}` alone marks the element
// of an array of scalars.
const isScalarArrayElement = (
    table: CompiledTable,
    dimension: CompiledDimension,
) =>
    table.nestedFrom !== undefined &&
    dimension.name === SCALAR_ELEMENT_NAME &&
    dimension.sql === SCALAR_ELEMENT_SQL;

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

// Unnested tables are not dbt models: their leaves are dotted columns of the
// model they were exploded from, so that is where a custom field is written.
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
    if (isScalarArrayElement(table, dimension)) {
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

// A bin lands on its base column. A SQL dimension stays on its own table, on
// the first referenced column of that table or else on the table's first column.
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
    // Time-interval dimensions are generated from a base column; only that
    // column exists in YAML.
    const toColumnDimension = (candidate: CompiledDimension | undefined) =>
        candidate?.timeIntervalBaseDimensionName === undefined
            ? candidate
            : table.dimensions[candidate.timeIntervalBaseDimensionName];
    const canHost = (candidate: CompiledDimension | undefined) =>
        candidate !== undefined &&
        !candidate.isAdditionalDimension &&
        !isElementPosition(table, candidate);
    const referenced = parseAllReferences(dimension.sql, dimension.table)
        .filter(({ refTable }) => refTable === dimension.table)
        .map(({ refName }) => toColumnDimension(table.dimensions[refName]))
        .find(canHost);
    const host =
        referenced ??
        Object.values(table.dimensions)
            .map(toColumnDimension)
            .filter(canHost)
            .sort((a, b) => (a?.index ?? 0) - (b?.index ?? 0))[0];
    if (!host) {
        throw new ParameterError(
            `No columns found in table "${dimension.table}" to hold custom dimension ${dimension.name}`,
        );
    }
    return resolveWritebackColumn(explore, dimension.table, host.name);
};
