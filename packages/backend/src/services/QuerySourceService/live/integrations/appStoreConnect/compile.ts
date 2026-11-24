import {
    ParameterError,
    type Explore,
    type MetricQuery,
    type SortField,
} from '@lightdash/common';
import {
    getActiveFilterRules,
    getApiName,
    getLiveDefinitionName,
    getLiveExplore,
    type LiveCompiledRequest,
} from '../../explores/definition';
import { refuseLiveQuery } from '../../query/refuse';
import {
    type AppStoreConnectRequest,
    type AppStoreConnectResource,
} from './run';

const RESOURCES: Record<string, AppStoreConnectResource> = {
    versions: 'appStoreVersions',
    builds: 'builds',
    customer_reviews: 'customerReviews',
    review_submissions: 'reviewSubmissions',
};

const REVIEW_SORTS = new Set(['rating', 'createdDate']);

/** Customer reviews sort by one rating or date; any other order is ours. */
const toSort = (
    resource: AppStoreConnectResource,
    sorts: SortField[],
    apiName: (fieldId: string) => string,
): { sort?: string; localSorts: SortField[] } => {
    const [first, ...others] = sorts;
    if (!first) {
        return { localSorts: [] };
    }
    const field = apiName(first.fieldId);
    if (
        resource !== 'customerReviews' ||
        others.length > 0 ||
        !REVIEW_SORTS.has(field)
    ) {
        return { localSorts: sorts };
    }
    return { sort: `${first.descending ? '-' : ''}${field}`, localSorts: [] };
};

/** Values each filter keeps; filters on the same field keep what they share. */
const toFilters = (
    metricQuery: MetricQuery,
    apiName: (fieldId: string) => string,
): Record<string, string[]> =>
    getActiveFilterRules(metricQuery.filters.dimensions).reduce<
        Record<string, string[]>
    >((filters, rule) => {
        const filter = apiName(rule.target.fieldId);
        const values = (rule.values ?? []).map(String);
        if (values.some((value) => value.includes(','))) {
            throw refuseLiveQuery(
                'live_source.refused.filter_operator',
                "App Store Connect can't filter on a value that contains a comma.",
            );
        }
        const kept = Object.hasOwn(filters, filter)
            ? filters[filter].filter((value) => values.includes(value))
            : values;
        if (kept.length === 0) {
            throw refuseLiveQuery(
                'live_source.refused.filter_operator',
                'Two filters on the same field share no value, so nothing can match. Remove one of them.',
            );
        }
        return { ...filters, [filter]: kept };
    }, {});

/**
 * Compiles a metric query on an App Store Connect explore into one list
 * read: Count from the list's total, or the selected fields as rows.
 */
export const compileAppStoreConnectQuery = ({
    explore,
    metricQuery,
}: {
    explore: Explore;
    metricQuery: MetricQuery;
}): LiveCompiledRequest => {
    const definition = getLiveDefinitionName(explore);
    if (!Object.hasOwn(RESOURCES, definition)) {
        throw new ParameterError(
            `"${explore.name}" isn't an App Store Connect explore.`,
        );
    }
    const resource = RESOURCES[definition];
    const apiSource = getLiveExplore(explore);
    const apiName = (fieldId: string) => getApiName(apiSource, fieldId);
    const filters = toFilters(metricQuery, apiName);
    const withFilters = Object.keys(filters).length > 0 ? { filters } : {};
    // Count with a dimension is refused by the shared check
    if (metricQuery.metrics.length > 0) {
        const request: AppStoreConnectRequest = {
            resource,
            fields: [],
            ...withFilters,
            count: true,
        };
        return { query: JSON.stringify(request), localSorts: [] };
    }
    const { localSorts, ...sort } = toSort(
        resource,
        metricQuery.sorts,
        apiName,
    );
    const request: AppStoreConnectRequest = {
        resource,
        fields: metricQuery.dimensions.map(apiName),
        ...withFilters,
        ...sort,
    };
    return { query: JSON.stringify(request), localSorts };
};
