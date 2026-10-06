import {
    getItemId,
    isField,
    isPeriodOverPeriodAdditionalMetric,
    type AdditionalMetric,
    type CompiledTable,
    type Explore,
    type Field,
    type ItemsMap,
    type MetricWithAssociatedTimeDimension,
} from '@lightdash/common';
import mapValues from 'lodash/mapValues';

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

const resolveModelledSql = (
    metric: AdditionalMetric,
    tables: Explore['tables'],
    additionalMetrics: AdditionalMetric[],
): string | undefined => {
    if (metric.sql) return metric.sql;
    if (isPeriodOverPeriodAdditionalMetric(metric)) {
        const baseMetric = Object.values(tables)
            .flatMap((table) => Object.values(table.metrics))
            .find((m) => getItemId(m) === metric.baseMetricId);
        if (baseMetric) return baseMetric.sql;
        const baseCustomMetric = additionalMetrics.find(
            (m) =>
                !isPeriodOverPeriodAdditionalMetric(m) &&
                getItemId(m) === metric.baseMetricId,
        );
        return baseCustomMetric
            ? resolveModelledSql(baseCustomMetric, tables, additionalMetrics)
            : undefined;
    }
    if (metric.baseMetricName) {
        return tables[metric.table]?.metrics[metric.baseMetricName]?.sql;
    }
    if (metric.baseDimensionName) {
        return tables[metric.table]?.dimensions[metric.baseDimensionName]?.sql;
    }
    return undefined;
};

/** Custom metrics built from a redacted explore carry no SQL; take it from the field they reference. */
export const resolveAdditionalMetricsSql = (
    additionalMetrics: AdditionalMetric[],
    tables: Explore['tables'],
): AdditionalMetric[] =>
    additionalMetrics.map((metric) => {
        if (metric.sql) return metric;
        const sql = resolveModelledSql(metric, tables, additionalMetrics);
        return sql ? { ...metric, sql } : metric;
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
