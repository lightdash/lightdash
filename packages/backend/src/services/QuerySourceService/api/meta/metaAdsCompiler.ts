import {
    FilterOperator,
    ParameterError,
    type Explore,
    type FieldId,
    type FilterRule,
    type MetricQuery,
    type SortField,
} from '@lightdash/common';
import { resolveAbsoluteDateRange } from '../apiDateRange';
import {
    getActiveFilterRules,
    getApiName,
    getApiSourceExplore,
    toApiSourceQueryError,
    toFieldCombinationIssue,
    type CompiledApiSourceQuery,
} from '../apiSourceExplore';
import { getFinestLevel, isFinerLevel } from '../apiSourceLevels';
import {
    META_ADS_BREAKDOWNS,
    META_ADS_FIELD_LEVELS,
    META_ADS_FILTER_FIELDS,
    META_ADS_LEVELS,
    type MetaAdsLevel,
} from './metaAdsSemanticLayer';

const REACH_METRICS = ['reach', 'frequency'];
const BREAKDOWNS: ReadonlySet<string> = new Set(META_ADS_BREAKDOWNS);
const REACH_BREAKDOWN_MONTHS = 13;

const refuse = (fieldId: FieldId | null, message: string) =>
    toApiSourceQueryError([toFieldCombinationIssue(fieldId, message)]);

type MetaAdsFilter = {
    field: string;
    operator: string;
    value: string | string[];
};

/** Expects a query that passed the shared check. */
const toFilters = (apiName: string, rule: FilterRule): MetaAdsFilter[] => {
    const field = META_ADS_FILTER_FIELDS[apiName];
    const values = (rule.values ?? []).map(String);
    const filter = (operator: string, value: string | string[]) => ({
        field,
        operator,
        value,
    });
    switch (rule.operator) {
        case FilterOperator.EQUALS:
            return [
                values.length === 1
                    ? filter('EQUAL', values[0])
                    : filter('IN', values),
            ];
        case FilterOperator.NOT_EQUALS:
            return [
                values.length === 1
                    ? filter('NOT_EQUAL', values[0])
                    : filter('NOT_IN', values),
            ];
        case FilterOperator.INCLUDE:
            if (values.length > 1) {
                throw new ParameterError(
                    `Meta Ads matches one "contains" value per filter; filter "${rule.target.fieldId}" by one value at a time.`,
                );
            }
            return [filter('CONTAIN', values[0])];
        case FilterOperator.NOT_INCLUDE:
            return values.map((value) => filter('NOT_CONTAIN', value));
        default:
            throw new ParameterError(
                `"${rule.target.fieldId}" can't be filtered with "${rule.operator}".`,
            );
    }
};

const getCutoffDate = (today: string, months: number) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - months);
    return date.toISOString().slice(0, 10);
};

/**
 * Insights sorts on its own metric fields, one at a time. Action-type
 * columns and dimensions are sorted on the returned rows.
 */
const getApiSort = (
    sorts: SortField[],
    metricIds: FieldId[],
    apiName: (fieldId: FieldId) => string,
): string | null => {
    const [sort, ...others] = sorts;
    if (!sort || others.length > 0 || !metricIds.includes(sort.fieldId)) {
        return null;
    }
    const name = apiName(sort.fieldId);
    return name.includes(':')
        ? null
        : `${name}_${sort.descending ? 'descending' : 'ascending'}`;
};

/**
 * Compiles a metric query on a Meta Ads explore into one Insights request.
 * The request reports at the finest ad object the query groups by, and Meta
 * totals reach for that grouping itself, so nothing is summed here.
 */
export const compileMetaAdsQuery = ({
    explore,
    metricQuery,
    today,
    maxRows,
}: {
    explore: Explore;
    metricQuery: MetricQuery;
    today: string;
    maxRows: number;
}): CompiledApiSourceQuery => {
    const apiSource = getApiSourceExplore(explore);
    const apiName = (fieldId: FieldId) => getApiName(apiSource, fieldId);
    const dateFieldId = apiSource.dateRange?.fieldId ?? null;
    const { startDate, endDate, otherFilters } = resolveAbsoluteDateRange({
        dateRange: apiSource.dateRange ?? undefined,
        filters: metricQuery.filters.dimensions,
        today,
    });

    const dateDimensions = metricQuery.dimensions.filter(
        (fieldId) => apiName(fieldId) === 'date_start',
    );
    if (dateDimensions.length > 1) {
        throw refuse(
            dateDimensions[1],
            `"${dateDimensions[0]}" can't be combined with "${dateDimensions[1]}": Meta Ads reports one date grain per query.`,
        );
    }
    const otherDimensions = metricQuery.dimensions.filter(
        (fieldId) => apiName(fieldId) !== 'date_start',
    );
    const fieldsByKind = otherDimensions.reduce<{
        objects: FieldId[];
        breakdowns: FieldId[];
    }>(
        (kinds, fieldId) => {
            (BREAKDOWNS.has(apiName(fieldId))
                ? kinds.breakdowns
                : kinds.objects
            ).push(fieldId);
            return kinds;
        },
        { objects: [], breakdowns: [] },
    );
    const breakdowns = fieldsByKind.breakdowns.map(apiName);

    const level =
        getFinestLevel(
            META_ADS_LEVELS,
            fieldsByKind.objects.map(
                (fieldId) => META_ADS_FIELD_LEVELS[apiName(fieldId)],
            ),
        ) ?? ('account' as MetaAdsLevel);

    if (
        breakdowns.includes('platform_position') &&
        !breakdowns.includes('publisher_platform')
    ) {
        throw refuse(
            fieldsByKind.breakdowns.find(
                (fieldId) => apiName(fieldId) === 'platform_position',
            ) ?? null,
            'Add Platform to this query: Meta Ads reports placements per platform.',
        );
    }

    const rules = getActiveFilterRules(otherFilters);
    // Meta doesn't document how a filter on a finer object rolls up into a
    // coarser row, so it isn't assumed.
    const finerFilter = rules.find((rule) => {
        const filterLevel = META_ADS_FIELD_LEVELS[apiName(rule.target.fieldId)];
        return filterLevel && isFinerLevel(META_ADS_LEVELS, filterLevel, level);
    });
    if (finerFilter) {
        throw refuse(
            finerFilter.target.fieldId,
            `Add "${finerFilter.target.fieldId}" to the dimensions to filter by it: Meta Ads doesn't document how that filter totals at a coarser level.`,
        );
    }

    const metricNames = metricQuery.metrics.map(apiName);
    if (
        breakdowns.length > 0 &&
        metricNames.some((name) => REACH_METRICS.includes(name)) &&
        startDate < getCutoffDate(today, REACH_BREAKDOWN_MONTHS)
    ) {
        throw refuse(
            null,
            `Meta Ads only reports reach and frequency with a breakdown for the last ${REACH_BREAKDOWN_MONTHS} months. Shorten the date range or remove the breakdown.`,
        );
    }

    const fields = [...fieldsByKind.objects.map(apiName), ...metricNames];
    if (metricNames.length === 0) {
        throw new ParameterError('Pick at least one Meta Ads metric.');
    }

    const getTimeIncrement = () => {
        if (dateDimensions.length === 0) {
            return 'all_days' as const;
        }
        return dateDimensions[0] === dateFieldId ? (1 as const) : 'monthly';
    };

    const apiSort = getApiSort(metricQuery.sorts, metricQuery.metrics, apiName);
    const isApiOrder = metricQuery.sorts.length === 0 || apiSort !== null;
    const requestLimit = isApiOrder ? metricQuery.limit : maxRows;
    const filtering = rules.flatMap((rule) =>
        toFilters(apiName(rule.target.fieldId), rule),
    );
    const request = {
        level,
        time_range: { since: startDate, until: endDate },
        time_increment: getTimeIncrement(),
        fields,
        ...(breakdowns.length > 0 ? { breakdowns } : {}),
        ...(filtering.length > 0 ? { filtering } : {}),
        ...(apiSort ? { sort: [apiSort] } : {}),
        limit: requestLimit,
    };
    return {
        query: JSON.stringify(request),
        requestLimit,
        limit: metricQuery.limit,
        fieldIdsByColumn: Object.fromEntries(
            [...metricQuery.dimensions, ...metricQuery.metrics].map(
                (fieldId) => [apiName(fieldId), fieldId],
            ),
        ),
        localSorts: isApiOrder ? [] : metricQuery.sorts,
    };
};
