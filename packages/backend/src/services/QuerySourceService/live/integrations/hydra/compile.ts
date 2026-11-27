import {
    FilterOperator,
    ParameterError,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import {
    getActiveFilterRules,
    getApiName,
    getLiveDefinitionName,
    getLiveExplore,
    resolveAbsoluteDateRange,
    type LiveCompiledRequest,
} from '../../sdk';
import { type HydraReportName, type HydraReportRequest } from './fake/report';

const isReportName = (name: string): name is HydraReportName =>
    name === 'events' || name === 'users';

/**
 * Compiles a metric query on a Hydra explore into one report. Hydra
 * filters, groups and sorts by itself, so nothing is sorted here. Expects a
 * query that passed the shared check; `today` is a UTC day.
 */
export const compileHydraQuery = ({
    explore,
    metricQuery,
    today,
}: {
    explore: Explore;
    metricQuery: MetricQuery;
    today: string;
}): LiveCompiledRequest => {
    const apiSource = getLiveExplore(explore);
    const report = getLiveDefinitionName(explore);
    if (!isReportName(report)) {
        throw new ParameterError(`Hydra has no ${report} report`);
    }
    const apiName = (fieldId: string) => getApiName(apiSource, fieldId);
    const { startDate, endDate, otherFilters } = apiSource.dateRange
        ? resolveAbsoluteDateRange({
              dateRange: apiSource.dateRange,
              filters: metricQuery.filters.dimensions,
              today,
          })
        : {
              startDate: undefined,
              endDate: undefined,
              otherFilters: metricQuery.filters.dimensions,
          };
    const request: HydraReportRequest = {
        report,
        dimensions: metricQuery.dimensions.map(apiName),
        metrics: metricQuery.metrics.map(apiName),
        ...(startDate && endDate ? { startDate, endDate } : {}),
        filters: getActiveFilterRules(otherFilters).map((rule) => ({
            field: apiName(rule.target.fieldId),
            operator:
                rule.operator === FilterOperator.NOT_EQUALS ? 'not_in' : 'in',
            values: (rule.values ?? []).map(String),
        })),
        orderBy: metricQuery.sorts.map(({ fieldId, descending }) => ({
            field: apiName(fieldId),
            descending,
        })),
        limit: metricQuery.limit,
    };
    return { query: JSON.stringify(request) };
};
