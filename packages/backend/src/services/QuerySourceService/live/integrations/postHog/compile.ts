import {
    FilterOperator,
    flattenFilterGroup,
    UnitOfTime,
    type ApiSourceExplore,
    type Explore,
    type FieldId,
    type FilterRule,
    type MetricQuery,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { compileMetricQuery } from '../../../../../queryCompiler';
import { MetricQueryBuilder } from '../../../../../utils/QueryBuilder/MetricQueryBuilder';
import {
    getApiName,
    getLiveExplore,
    type LiveCompiledRequest,
} from '../../explores/definition';

/** Null checks don't bound the dates read, so they keep the default. */
const UNBOUNDED_OPERATORS = [FilterOperator.NULL, FilterOperator.NOT_NULL];

const withDefaultDateRange = (
    apiSource: ApiSourceExplore,
    metricQuery: MetricQuery,
    dateRange: { fieldId: FieldId; defaultDays: number },
): MetricQuery => {
    const { dimensions } = metricQuery.filters;
    // The date, week, month and time fields all read the event timestamp:
    // a filter on any of them chooses the dates instead of the default
    const timestamp = getApiName(apiSource, dateRange.fieldId);
    const isDateFiltered = (
        dimensions ? flattenFilterGroup(dimensions) : []
    ).some(
        (rule) =>
            !rule.disabled &&
            !UNBOUNDED_OPERATORS.includes(rule.operator) &&
            Object.hasOwn(apiSource.fields, rule.target.fieldId) &&
            getApiName(apiSource, rule.target.fieldId) === timestamp,
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
 * HogQL is built on. Without a filter on the event date, week, month or
 * time it reads the last `defaultDays`, so a question never scans the whole
 * event history.
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
}): LiveCompiledRequest => {
    const apiSource = getLiveExplore(explore);
    const query = apiSource.dateRange
        ? withDefaultDateRange(apiSource, metricQuery, apiSource.dateRange)
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
    // Table calculations are columns of the inner query, named by name
    const fieldIds = [
        ...query.dimensions,
        ...query.metrics,
        ...query.tableCalculations.map(({ name }) => name),
    ];
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
        fieldIdsByColumn: Object.fromEntries(
            [...columnByFieldId].map(([fieldId, column]) => [column, fieldId]),
        ),
    };
};
