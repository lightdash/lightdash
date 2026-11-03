import {
    FilterOperator,
    flattenFilterGroup,
    UnitOfTime,
    type Explore,
    type FieldId,
    type FilterRule,
    type MetricQuery,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { compileMetricQuery } from '../../../../queryCompiler';
import { MetricQueryBuilder } from '../../../../utils/QueryBuilder/MetricQueryBuilder';
import {
    assertApiSourceQuery,
    type CompiledApiSourceQuery,
} from '../apiSourceExplore';

const withDefaultDateRange = (
    metricQuery: MetricQuery,
    dateRange: { fieldId: FieldId; defaultDays: number },
): MetricQuery => {
    const { dimensions } = metricQuery.filters;
    const isDateFiltered = (
        dimensions ? flattenFilterGroup(dimensions) : []
    ).some(
        (rule) => !rule.disabled && rule.target.fieldId === dateRange.fieldId,
    );
    if (isDateFiltered) {
        return metricQuery;
    }
    const defaultRule: FilterRule = {
        id: 'live-data-source-default-date-range',
        target: { fieldId: dateRange.fieldId },
        operator: FilterOperator.IN_THE_PAST,
        values: [dateRange.defaultDays],
        settings: { unitOfTime: UnitOfTime.days, completed: false },
    };
    return {
        ...metricQuery,
        filters: {
            ...metricQuery.filters,
            dimensions: dimensions
                ? {
                      id: 'live-data-source-filters',
                      and: [defaultRule, dimensions],
                  }
                : { id: 'live-data-source-filters', and: [defaultRule] },
        },
    };
};

/**
 * Compiles a metric query on a PostHog explore into one HogQL query, using
 * the same SQL builder as warehouse explores with the ClickHouse dialect
 * HogQL is built on. Without a date filter it reads the last
 * `defaultDays`, so a question never scans the whole event history.
 */
export const compilePostHogQuery = ({
    explore,
    metricQuery,
    warehouseSqlBuilder,
    timezone,
}: {
    explore: Explore;
    metricQuery: MetricQuery;
    warehouseSqlBuilder: WarehouseSqlBuilder;
    timezone: string;
}): CompiledApiSourceQuery => {
    const apiSource = assertApiSourceQuery(explore, metricQuery);
    const query = apiSource.dateRange
        ? withDefaultDateRange(metricQuery, apiSource.dateRange)
        : metricQuery;
    const { query: selectSql } = new MetricQueryBuilder({
        explore,
        compiledMetricQuery: compileMetricQuery({
            explore,
            metricQuery: query,
            warehouseSqlBuilder,
            availableParameters: [],
        }),
        warehouseSqlBuilder,
        parameterDefinitions: {},
        intrinsicUserAttributes: {},
        timezone,
    }).compileQuery({ excludeOrderByAndLimit: true });

    // Field ids can outgrow the connector's column names, so columns are
    // renamed by position; sorting happens here, the connector adds the limit.
    const quote = warehouseSqlBuilder.getFieldQuoteChar();
    const fieldIds = [...query.dimensions, ...query.metrics];
    const columnByFieldId = new Map(
        fieldIds.map((fieldId, index) => [fieldId, `c${index}`]),
    );
    const orderBy = query.sorts.flatMap(({ fieldId, descending }) => {
        const column = columnByFieldId.get(fieldId);
        return column ? [`${column} ${descending ? 'DESC' : 'ASC'}`] : [];
    });
    const hogql = [
        `SELECT ${fieldIds
            .map(
                (fieldId) =>
                    `${quote}${fieldId}${quote} AS ${columnByFieldId.get(fieldId)}`,
            )
            .join(', ')}`,
        `FROM (\n${selectSql}\n) AS live_query`,
        ...(orderBy.length > 0 ? [`ORDER BY ${orderBy.join(', ')}`] : []),
    ].join('\n');

    return {
        query: hogql,
        requestLimit: query.limit,
        limit: query.limit,
        fieldIdsByColumn: Object.fromEntries(
            [...columnByFieldId].map(([fieldId, column]) => [column, fieldId]),
        ),
        localSorts: [],
    };
};
