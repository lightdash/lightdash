import {
    FilterOperator,
    getItemLabelWithoutTableName,
    getItemMap,
    ParameterError,
    type Explore,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import {
    getActiveFilterRules,
    getApiName,
    getLiveDefinitionName,
    getLiveExplore,
    getLiveRequestLimit,
    type LiveCompiledRequest,
} from '../../explores/definition';
import {
    getLiveDateRange,
    splitDateRangeFilter,
    toAbsoluteDateRange,
} from '../../query/dateRange';
import { refuseLiveQuery } from '../../query/refuse';
import { getGooglePlayExplore, isGooglePlayRollingMetric } from './explores';

const REQUIRED_DIMENSION_REFUSALS: Record<string, string> = {
    startType:
        'Google Play reports slow starts per start type. Add Start type to the query, or filter it to one of COLD, WARM or HOT.',
    reportType:
        'Google Play reports errors per report type. Add Report type to the query, or filter it to one of CRASH, ANR or NON_FATAL.',
};

/** The first day the API still reports: it keeps three years of daily data. */
export const getGooglePlayEarliestDate = (today: string): string => {
    const date = new Date(`${today}T00:00:00Z`);
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCFullYear(date.getUTCFullYear() - 3);
    const lastDay = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay) + 1);
    return date.toISOString().slice(0, 10);
};

const listLabels = (labels: string[]) =>
    labels.length <= 1
        ? labels.join('')
        : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;

const toFilter = (dimension: string, rule: FilterRule) => {
    if (rule.operator !== FilterOperator.EQUALS) {
        throw new ParameterError(
            `"${rule.target.fieldId}" can't be filtered with "${rule.operator}".`,
        );
    }
    const values = (rule.values ?? []).map(String);
    if (values.some((value) => /["\\]/.test(value))) {
        throw refuseLiveQuery(
            'live_source.refused.filter_operator',
            "Google Play can't filter on a value that contains a quote or a backslash.",
        );
    }
    return `(${values
        .map((value) => `${dimension} = "${value}"`)
        .join(' OR ')})`;
};

/**
 * Compiles a metric query on a Google Play explore into one query of its
 * metric set. The API can't sort, so every sort runs on our side. `today`
 * is in Pacific Time, the time zone daily vitals use.
 */
export const compileGooglePlayQuery = ({
    explore,
    metricQuery,
    today,
    maxRows,
}: {
    explore: Explore;
    metricQuery: MetricQuery;
    today: string;
    maxRows: number;
}): LiveCompiledRequest => {
    const apiSource = getLiveExplore(explore);
    const definitionName = getLiveDefinitionName(explore);
    const playExplore = getGooglePlayExplore(definitionName);
    if (!playExplore) {
        throw new ParameterError(
            `"${definitionName}" isn't a Google Play explore`,
        );
    }
    const { metricSet, requiredDimension, definition } = playExplore;
    const apiName = (fieldId: string) => getApiName(apiSource, fieldId);
    const itemsMap = getItemMap(explore);
    const label = (fieldId: string) =>
        itemsMap[fieldId]
            ? getItemLabelWithoutTableName(itemsMap[fieldId])
            : fieldId;

    const { dateRule, otherFilters } = apiSource.dateRange
        ? splitDateRangeFilter(
              metricQuery.filters.dimensions,
              apiSource.dateRange.fieldId,
          )
        : { dateRule: null, otherFilters: metricQuery.filters.dimensions };
    const earliestDate = getGooglePlayEarliestDate(today);
    const dateRange = toAbsoluteDateRange(
        getLiveDateRange({
            rule: dateRule,
            defaultDays: apiSource.dateRange?.defaultDays ?? 28,
            today,
            earliestDate,
        }),
        today,
    );
    if (dateRange.startDate > dateRange.endDate) {
        throw new ParameterError(
            `Google Play has data from ${earliestDate} to ${today}. Pick a date in that range.`,
        );
    }

    const dimensions = metricQuery.dimensions.map(apiName);
    const rules = getActiveFilterRules(otherFilters);

    if (!dimensions.includes('date')) {
        const daily = metricQuery.metrics.filter(
            (fieldId) => !isGooglePlayRollingMetric(apiName(fieldId)),
        );
        if (daily.length > 0) {
            const hasRolling = definition.metrics.some(({ apiName: name }) =>
                isGooglePlayRollingMetric(name),
            );
            throw refuseLiveQuery(
                'live_source.refused.field_combination',
                `Google Play reports ${listLabels(daily.map(label))} per day. ${
                    hasRolling
                        ? 'Add Date to the query, or use a 7-day or 28-day metric to get one number for the latest day.'
                        : 'Add Date to the query.'
                }`,
            );
        }
    }

    if (requiredDimension && !dimensions.includes(requiredDimension)) {
        const requiredRules = rules.filter(
            (rule) => apiName(rule.target.fieldId) === requiredDimension,
        );
        const isOneValue =
            requiredRules.length === 1 &&
            requiredRules[0].operator === FilterOperator.EQUALS &&
            (requiredRules[0].values ?? []).length === 1;
        if (!isOneValue) {
            throw refuseLiveQuery(
                'live_source.refused.field_combination',
                REQUIRED_DIMENSION_REFUSALS[requiredDimension],
            );
        }
    }

    const filter = rules
        .map((rule) => toFilter(apiName(rule.target.fieldId), rule))
        .join(' AND ');
    const localSorts = metricQuery.sorts;
    const request = {
        metricSet,
        ...dateRange,
        ...(dimensions.length > 0 ? { dimensions } : {}),
        ...(filter ? { filter } : {}),
        rowLimit: getLiveRequestLimit(metricQuery.limit, localSorts, maxRows),
    };
    return { query: JSON.stringify(request), localSorts };
};
