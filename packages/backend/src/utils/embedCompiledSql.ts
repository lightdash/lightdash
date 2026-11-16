import {
    isField,
    type CompiledTable,
    type Explore,
    type Field,
    type ItemsMap,
    type MetricWithAssociatedTimeDimension,
} from '@lightdash/common';
import { mapValues } from 'es-toolkit/compat';

export const redactFieldSql = <T extends Field>(field: T): T => ({
    ...field,
    sql: '',
    ...('compiledSql' in field ? { compiledSql: '' } : {}),
    compiledValueSql: undefined,
    compiledDistinctKeys: undefined,
    compiledRelativeDateFilters: undefined,
    compiledTimestampFilters: undefined,
});

export const redactItemsMapSql = (itemsMap: ItemsMap): ItemsMap =>
    mapValues(itemsMap, (item) =>
        isField(item) ? redactFieldSql(item) : item,
    );

const redactTableSql = (table: CompiledTable): CompiledTable => ({
    ...table,
    sqlTable: '',
    sqlWhere: undefined,
    uncompiledSqlWhere: undefined,
    dimensions: mapValues(table.dimensions, redactFieldSql),
    metrics: mapValues(table.metrics, redactFieldSql),
});

export const redactExploreSql = (explore: Explore): Explore => ({
    ...explore,
    joinedTables: explore.joinedTables.map((join) => ({
        ...join,
        sqlOn: '',
        compiledSqlOn: '',
    })),
    tables: mapValues(explore.tables, redactTableSql),
    ...(explore.unfilteredTables
        ? {
              unfilteredTables: mapValues(
                  explore.unfilteredTables,
                  redactTableSql,
              ),
          }
        : {}),
});

export const redactCatalogMetricSql = (
    metric: MetricWithAssociatedTimeDimension,
): MetricWithAssociatedTimeDimension => ({
    ...redactFieldSql(metric),
    ...(metric.availableTimeDimensions
        ? {
              availableTimeDimensions:
                  metric.availableTimeDimensions.map(redactFieldSql),
          }
        : {}),
});
