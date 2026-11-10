import {
    FilterOperator,
    ParameterError,
    type Explore,
    type FilterRule,
    type MetricQuery,
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
import {
    LINKEDIN_ADS_MAX_QUERY_ROWS,
    type LinkedInAdsPivot,
} from './LinkedInAdsConnector';
import {
    LINKEDIN_ADS_CAMPAIGN_COLUMNS,
    LINKEDIN_ADS_CAMPAIGN_GROUP_COLUMNS,
} from './linkedinAdsSemanticLayer';

const REACH_METRIC = 'approximateMemberReach';
const REACH_MAX_DAYS = 92;
// Reports need a metric; dimension-only queries ask for this one and drop it.
const DIMENSION_ONLY_METRIC = 'impressions';
const NUMERIC_ID = /^\d{1,20}$/;
const DAY_MS = 86_400_000;

const TIME_GRANULARITIES: Record<string, string> = {
    day: 'DAILY',
    month: 'MONTHLY',
    year: 'YEARLY',
};

const refuse = (fieldId: string | null, message: string) =>
    toApiSourceQueryError([toFieldCombinationIssue(fieldId, message)]);

const includesColumn = (columns: readonly string[], name: string) =>
    columns.includes(name);

const getPivot = (dimensions: string[]): LinkedInAdsPivot => {
    if (
        dimensions.some((n) => includesColumn(LINKEDIN_ADS_CAMPAIGN_COLUMNS, n))
    ) {
        return 'CAMPAIGN';
    }
    return dimensions.some((n) =>
        includesColumn(LINKEDIN_ADS_CAMPAIGN_GROUP_COLUMNS, n),
    )
        ? 'CAMPAIGN_GROUP'
        : 'ACCOUNT';
};

const toIds = (rule: FilterRule) => {
    if (rule.operator !== FilterOperator.EQUALS) {
        throw new ParameterError(
            `"${rule.target.fieldId}" can't be filtered with "${rule.operator}".`,
        );
    }
    return (rule.values ?? []).map((value) => {
        const id = String(value);
        if (!NUMERIC_ID.test(id)) {
            throw new ParameterError(`"${id}" isn't a LinkedIn numeric ID.`);
        }
        return id;
    });
};

const daysBetween = (startDate: string, endDate: string) =>
    Math.round(
        (new Date(`${endDate}T00:00:00Z`).getTime() -
            new Date(`${startDate}T00:00:00Z`).getTime()) /
            DAY_MS,
    );

const getSixMonthsAgo = (today: string) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - 6);
    return date.toISOString().slice(0, 10);
};

const isMonthEnd = (isoDate: string) => {
    const next = new Date(`${isoDate}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return next.getUTCDate() === 1;
};

/**
 * With no date breakdown LinkedIn widens bounds older than six months to whole
 * months, which would silently report days nobody asked for.
 */
const assertNotRoundedByLinkedIn = (
    { startDate, endDate }: { startDate: string; endDate: string },
    today: string,
) => {
    const cutoff = getSixMonthsAgo(today);
    const startRounds = startDate < cutoff && !startDate.endsWith('-01');
    const endRounds = endDate < cutoff && !isMonthEnd(endDate);
    if (startRounds || endRounds) {
        throw refuse(
            null,
            'LinkedIn rounds totals older than six months to whole months. Add a date breakdown, or start on the first of a month and end on the last of a month.',
        );
    }
};

/** Compiles a metric query on a LinkedIn Ads explore into one adAnalytics request. */
export const compileLinkedInAdsQuery = ({
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
    const { otherFilters, ...dateRange } = resolveAbsoluteDateRange({
        dateRange: apiSource.dateRange ?? undefined,
        filters: metricQuery.filters.dimensions,
        today,
    });

    const dimensions = metricQuery.dimensions.map(apiName);
    const dateColumns = dimensions.filter(
        (name) => TIME_GRANULARITIES[name] !== undefined,
    );
    if (dateColumns.length > 1) {
        throw refuse(null, 'Pick one date grain: day, month or year.');
    }
    const pivot = getPivot(dimensions);

    const metrics =
        metricQuery.metrics.length > 0
            ? metricQuery.metrics.map(apiName)
            : [DIMENSION_ONLY_METRIC];

    const rules = getActiveFilterRules(otherFilters);
    // LinkedIn documents these facets only at or below their own level
    const campaigns = rules.filter(
        (rule) => apiName(rule.target.fieldId) === 'campaign.id',
    );
    const campaignGroups = rules.filter(
        (rule) => apiName(rule.target.fieldId) === 'campaignGroup.id',
    );
    const tooFine =
        (pivot !== 'CAMPAIGN' ? campaigns[0] : undefined) ??
        (pivot === 'ACCOUNT' ? campaignGroups[0] : undefined);
    if (tooFine) {
        throw refuse(
            tooFine.target.fieldId,
            `Add "${tooFine.target.fieldId}" to the dimensions to filter by it: LinkedIn doesn't document how that filter totals at a coarser level.`,
        );
    }

    if (dateColumns.length === 0) {
        assertNotRoundedByLinkedIn(dateRange, today);
    }
    if (
        metrics.includes(REACH_METRIC) &&
        daysBetween(dateRange.startDate, dateRange.endDate) + 1 > REACH_MAX_DAYS
    ) {
        throw refuse(
            null,
            `LinkedIn reports reach for at most ${REACH_MAX_DAYS} days at a time. Shorten the date range or remove reach.`,
        );
    }

    const isApiOrder = metricQuery.sorts.length === 0;
    const requestLimit = isApiOrder
        ? metricQuery.limit
        : LINKEDIN_ADS_MAX_QUERY_ROWS;
    const campaignIds = campaigns.flatMap(toIds);
    const campaignGroupIds = campaignGroups.flatMap(toIds);
    const request = {
        pivot,
        timeGranularity:
            dateColumns.length > 0 ? TIME_GRANULARITIES[dateColumns[0]] : 'ALL',
        dateRange: {
            start: dateRange.startDate,
            end: dateRange.endDate,
        },
        fields: metrics,
        dimensions,
        ...(campaignIds.length > 0 ? { campaigns: campaignIds } : {}),
        ...(campaignGroupIds.length > 0
            ? { campaignGroups: campaignGroupIds }
            : {}),
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
        // adAnalytics sorts on a few metrics only and has no pagination, so
        // every row is here to sort.
        localSorts: metricQuery.sorts,
    };
};
