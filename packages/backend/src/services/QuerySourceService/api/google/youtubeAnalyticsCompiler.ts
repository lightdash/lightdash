import {
    FilterOperator,
    ParameterError,
    type Explore,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import {
    getApiDateRange,
    splitDateRangeFilter,
    toAbsoluteDateRange,
} from '../apiDateRange';
import {
    getActiveFilterRules,
    getApiName,
    getApiSourceExplore,
    toApiSourceQueryError,
    toFieldCombinationIssue,
    type CompiledApiSourceQuery,
} from '../apiSourceExplore';

const refuse = ({
    fieldId,
    message,
}: {
    fieldId: string | null;
    message: string;
}) => toApiSourceQueryError([toFieldCombinationIssue(fieldId, message)]);

// Reports need a metric; dimension-only queries ask for this one and drop it.
const DIMENSION_ONLY_METRIC = 'views';
const CONTENT_TYPE = 'creatorContentType';

// The dimension sets of YouTube's documented channel reports, each of which
// can also take the content type
// (https://developers.google.com/youtube/analytics/channel_reports)
const REPORTS: string[][] = [
    [],
    ['day'],
    ['month'],
    ['country'],
    ['video'],
    ['deviceType'],
    ['deviceType', 'day'],
    ['insightTrafficSourceType'],
    ['insightTrafficSourceType', 'day'],
];

// The sorts the Top videos report accepts, always descending
const TOP_VIDEO_SORTS = [
    'views',
    'estimatedMinutesWatched',
    'subscribersGained',
    'subscribersLost',
];

const COUNTRY_CODE = /^[A-Z]{2}$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_VIDEO_FILTER_VALUES = 500;

const sameMembers = (left: string[], right: string[]) =>
    left.length === right.length && left.every((name) => right.includes(name));

const assertDocumentedReport = (dimensions: string[]) => {
    const report = dimensions.filter((name) => name !== CONTENT_TYPE);
    if (report.includes('day') && report.includes('month')) {
        throw refuse({
            fieldId: null,
            message: 'Pick one date grain: day or month.',
        });
    }
    if (report.length === 0 && dimensions.length > 0) {
        throw refuse({
            fieldId: null,
            message:
                'Add a date, country, video, device type or traffic source to break down by content type.',
        });
    }
    if (!REPORTS.some((known) => sameMembers(known, report))) {
        throw refuse({
            fieldId: null,
            message: `YouTube has no report for ${report.join(' with ')}. Use one of a date, country, video, device type or traffic source; device type and traffic source can also be split by day.`,
        });
    }
};

const toFilters = (rules: FilterRule[], apiName: (id: string) => string) =>
    rules.map((rule) => {
        const name = apiName(rule.target.fieldId);
        const values = (rule.values ?? []).map(String);
        if (rule.operator !== FilterOperator.EQUALS) {
            throw new ParameterError(
                `"${rule.target.fieldId}" can't be filtered with "${rule.operator}".`,
            );
        }
        if (name === 'country') {
            if (values.length > 1) {
                throw refuse({
                    fieldId: rule.target.fieldId,
                    message: 'YouTube filters one country at a time.',
                });
            }
            if (!COUNTRY_CODE.test(values[0])) {
                throw new ParameterError(
                    `"${values[0]}" isn't a two-letter country code. Use a code such as US.`,
                );
            }
        }
        if (name === 'video') {
            if (values.length > MAX_VIDEO_FILTER_VALUES) {
                throw refuse({
                    fieldId: rule.target.fieldId,
                    message: `YouTube filters at most ${MAX_VIDEO_FILTER_VALUES} videos at a time.`,
                });
            }
            const invalid = values.find((value) => !VIDEO_ID.test(value));
            if (invalid !== undefined) {
                throw new ParameterError(
                    `"${invalid}" isn't a YouTube video ID.`,
                );
            }
        }
        return `${name}==${values.join(',')}`;
    });

const getMonthStart = (today: string, monthsBack: number) => {
    const date = new Date(`${today}T00:00:00Z`);
    return new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - monthsBack, 1),
    )
        .toISOString()
        .slice(0, 10);
};

const isLastDayOfMonth = (isoDate: string) => {
    const next = new Date(`${isoDate}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return next.getUTCDate() === 1;
};

const WHOLE_MONTHS_MESSAGE =
    'YouTube reports whole months only. Filter the date to start on the first of a month and end on the last of a month, today, or use completed months.';

/** The API needs both bounds on the first day of a month. */
const getMonthRange = (
    dateRule: FilterRule | null,
    today: string,
    { startDate, endDate }: { startDate: string; endDate: string },
) => {
    if (!dateRule) {
        return {
            startDate: getMonthStart(today, 12),
            endDate: getMonthStart(today, 1),
        };
    }
    if (
        !startDate.endsWith('-01') ||
        !(endDate === today || isLastDayOfMonth(endDate))
    ) {
        throw refuse({
            fieldId: dateRule.target.fieldId,
            message: WHOLE_MONTHS_MESSAGE,
        });
    }
    return { startDate, endDate: `${endDate.slice(0, 7)}-01` };
};

const getTopVideoSort = (
    sorts: { name: string; descending: boolean }[],
    metrics: string[],
): string => {
    if (sorts.length > 1) {
        throw refuse({
            fieldId: null,
            message: 'Sort a video breakdown by one metric only.',
        });
    }
    const [sort] = sorts;
    const name =
        sort?.name ??
        metrics.find((metric) => TOP_VIDEO_SORTS.includes(metric));
    if (name === undefined || !TOP_VIDEO_SORTS.includes(name)) {
        throw refuse({
            fieldId: null,
            message:
                'YouTube ranks videos by views, estimated minutes watched, subscribers gained or subscribers lost. Sort by one of them.',
        });
    }
    if (sort && !sort.descending) {
        throw refuse({
            fieldId: null,
            message: 'YouTube only ranks videos from highest to lowest.',
        });
    }
    return `-${name}`;
};

/** Compiles a metric query on a YouTube explore into one reports.query request. */
export const compileYoutubeAnalyticsQuery = ({
    explore,
    metricQuery,
    today,
}: {
    explore: Explore;
    metricQuery: MetricQuery;
    today: string;
}): CompiledApiSourceQuery => {
    const apiSource = getApiSourceExplore(explore);
    const apiName = (fieldId: string) => getApiName(apiSource, fieldId);
    const { dateRule, otherFilters } = apiSource.dateRange
        ? splitDateRangeFilter(
              metricQuery.filters.dimensions,
              apiSource.dateRange.fieldId,
          )
        : { dateRule: null, otherFilters: metricQuery.filters.dimensions };

    const dimensions = metricQuery.dimensions.map(apiName);
    assertDocumentedReport(dimensions);

    const rules = getActiveFilterRules(otherFilters);
    // Reports document these filters only for the other dimensions
    const selfFilter = rules.find((rule) =>
        dimensions.includes(apiName(rule.target.fieldId)),
    );
    if (selfFilter) {
        throw refuse({
            fieldId: selfFilter.target.fieldId,
            message: `YouTube can't filter by "${selfFilter.target.fieldId}" while also breaking down by it. Remove the filter or the field.`,
        });
    }
    const filters = toFilters(rules, apiName);

    const absoluteRange = toAbsoluteDateRange(
        getApiDateRange({
            rule: dateRule,
            defaultDays: apiSource.dateRange?.defaultDays ?? 28,
            today,
        }),
        today,
    );
    const { startDate, endDate } = dimensions.includes('month')
        ? getMonthRange(dateRule, today, absoluteRange)
        : absoluteRange;

    const metrics =
        metricQuery.metrics.length > 0
            ? metricQuery.metrics.map(apiName)
            : [DIMENSION_ONLY_METRIC];
    const sorts = metricQuery.sorts.map((sort) => ({
        name: apiName(sort.fieldId),
        descending: sort.descending,
    }));
    const sort = dimensions.includes('video')
        ? getTopVideoSort(sorts, metrics)
        : sorts
              .map(({ name, descending }) => (descending ? `-${name}` : name))
              .join(',');

    const request = {
        startDate,
        endDate,
        metrics: metrics.join(','),
        ...(dimensions.length > 0 ? { dimensions: dimensions.join(',') } : {}),
        ...(filters.length > 0 ? { filters: filters.join(';') } : {}),
        ...(sort ? { sort } : {}),
        maxResults: metricQuery.limit,
    };
    return {
        query: JSON.stringify(request),
        requestLimit: metricQuery.limit,
        limit: metricQuery.limit,
        fieldIdsByColumn: Object.fromEntries(
            [...metricQuery.dimensions, ...metricQuery.metrics].map(
                (fieldId) => [apiName(fieldId), fieldId],
            ),
        ),
        localSorts: [],
    };
};
