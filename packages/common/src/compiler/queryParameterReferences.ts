import type { Explore } from '../types/explore';
import {
    convertFieldRefToFieldId,
    isCustomBinDimension,
    type FieldId,
} from '../types/field';
import { isJoinModelRequiredFilter } from '../types/filter';
import type { SemanticLayerSourceQuery } from '../types/querySources';
import { getTotalFilterRules } from '../utils/filters';
import { getItemId } from '../utils/item';
import { parseAllReferences } from './exploreCompiler';
import { getJoinedTables } from './joinInflation';
import { getParameterReferences } from './parameters';

export type QueryParameterScope = Pick<
    SemanticLayerSourceQuery,
    | 'dimensions'
    | 'metrics'
    | 'filters'
    | 'additionalMetrics'
    | 'customDimensions'
    | 'tableCalculations'
>;

/**
 * Parameter names a query's compiled SQL can depend on: the fields it selects,
 * filters and derives from, the model's required filters, the base table's
 * sql_where, the sql_from of every table it touches, and the joins bringing them in.
 */
export const getQueryParameterReferences = (
    explore: Explore,
    {
        dimensions,
        metrics,
        filters,
        additionalMetrics = [],
        customDimensions = [],
        tableCalculations = [],
    }: QueryParameterScope,
): string[] => {
    const references = new Set<string>();
    const fieldIds = new Set<FieldId>([
        ...dimensions,
        ...metrics,
        ...getTotalFilterRules(filters ?? {}).map(
            (rule) => rule.target.fieldId,
        ),
    ]);
    const tableNames = new Set([explore.baseTable]);
    const addSql = (sql: string, table: string) => {
        getParameterReferences(sql).forEach((name) => references.add(name));
        parseAllReferences(sql, table).forEach(({ refTable, refName }) => {
            tableNames.add(refTable);
            fieldIds.add(getItemId({ table: refTable, name: refName }));
        });
    };

    const baseTable = explore.tables[explore.baseTable];
    if (baseTable?.uncompiledSqlWhere) {
        addSql(baseTable.uncompiledSqlWhere, explore.baseTable);
    }
    // Join required filters always join their table; only enforced ones add WHERE SQL.
    baseTable?.requiredFilters?.forEach((filter) => {
        const table = isJoinModelRequiredFilter(filter)
            ? filter.target.tableName
            : explore.baseTable;
        tableNames.add(table);
        if (filter.required === false) return;
        fieldIds.add(convertFieldRefToFieldId(filter.target.fieldRef, table));
    });

    customDimensions
        .filter((dimension) => fieldIds.has(dimension.id))
        .forEach((dimension) => {
            if (isCustomBinDimension(dimension)) {
                fieldIds.add(dimension.dimensionId);
            } else {
                addSql(dimension.sql, dimension.table);
            }
        });
    additionalMetrics
        .filter((metric) => fieldIds.has(getItemId(metric)))
        .forEach((metric) => {
            addSql(metric.sql, metric.table);
            if (metric.baseDimensionName) {
                fieldIds.add(
                    getItemId({
                        table: metric.table,
                        name: metric.baseDimensionName,
                    }),
                );
            }
            if (metric.baseMetricId) fieldIds.add(metric.baseMetricId);
            if (metric.timeDimensionId) fieldIds.add(metric.timeDimensionId);
            metric.filters?.forEach((filter) =>
                fieldIds.add(
                    convertFieldRefToFieldId(
                        filter.target.fieldRef,
                        metric.table,
                    ),
                ),
            );
        });
    tableCalculations.forEach((calculation) => {
        if ('sql' in calculation) {
            getParameterReferences(calculation.sql).forEach((name) =>
                references.add(name),
            );
        }
    });

    Object.values(explore.tables).forEach((table) => {
        [
            ...Object.values(table.dimensions),
            ...Object.values(table.metrics),
        ].forEach((field) => {
            if (!fieldIds.has(getItemId(field))) return;
            field.parameterReferences?.forEach((name) => references.add(name));
            tableNames.add(field.table);
            field.tablesReferences?.forEach((name) => tableNames.add(name));
        });
    });
    explore.joinedTables
        .filter((join) => join.always)
        .forEach((join) => tableNames.add(join.table));
    getJoinedTables(explore, [...tableNames]).forEach((name) =>
        tableNames.add(name),
    );

    explore.joinedTables
        .filter((join) => tableNames.has(join.table))
        .forEach((join) =>
            join.parameterReferences?.forEach((name) => references.add(name)),
        );
    // Only the base table's sql_where is applied; every joined table's sql_from is.
    baseTable?.parameterReferences?.forEach((name) => references.add(name));
    tableNames.forEach((name) => {
        const table = explore.tables[name];
        if (!table?.sqlTable) return;
        getParameterReferences(table.sqlTable).forEach((reference) =>
            references.add(reference),
        );
    });
    return [...references];
};
