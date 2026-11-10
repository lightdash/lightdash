import {
    FilterOperator,
    getDimensions,
    getItemId,
    ParameterError,
    type ApiSourceExplore,
    type ApiSourceQueryIssue,
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
import { getFinestLevel, isFinerLevel } from '../apiSourceLevels';
import { escapeRe2 } from '../escapeRe2';
import { GOOGLE_ADS_MICROS_FIELDS } from './googleAdsSemanticLayer';

// Reports need a metric; dimension-only queries ask for this one and drop it.
const DIMENSION_ONLY_METRIC = 'metrics.impressions';

// Coarsest first; a report's FROM is the finest resource it selects.
const RESOURCES = ['customer', 'campaign', 'ad_group'] as const;
type GoogleAdsResource = (typeof RESOURCES)[number];

const getResource = (apiName: string): GoogleAdsResource | null =>
    RESOURCES.find((resource) => apiName.startsWith(`${resource}.`)) ?? null;

const isSegment = (apiName: string) => apiName.startsWith('segments.');
const isNumericId = (apiName: string) => apiName.endsWith('.id');

const quote = (value: string) =>
    `'${value
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t')}'`;

// GAQL LIKE wildcards are % and _; brackets make any of them literal
const escapeLike = (value: string) => value.replace(/[[\]%_]/g, '[$&]');

const toLiteral = (apiName: string, value: string) => {
    if (!isNumericId(apiName)) {
        return quote(value);
    }
    if (!/^\d+$/.test(value)) {
        throw new ParameterError(`"${value}" isn't a Google Ads ID.`);
    }
    return value;
};

const anyOf = (values: string[]) => `(${values.map(escapeRe2).join('|')})`;

const toDimensionConditions = (apiName: string, rule: FilterRule): string[] => {
    const values = (rule.values ?? []).map(String);
    const list = () =>
        `(${values.map((value) => toLiteral(apiName, value)).join(', ')})`;
    const [first] = values;
    const like = (pattern: string) => `${apiName} LIKE ${quote(pattern)}`;
    const regex = (pattern: string) =>
        `${apiName} REGEXP_MATCH ${quote(pattern)}`;
    const isSingle = values.length === 1;
    switch (rule.operator) {
        case FilterOperator.EQUALS:
            return [
                isSingle
                    ? `${apiName} = ${toLiteral(apiName, first)}`
                    : `${apiName} IN ${list()}`,
            ];
        case FilterOperator.NOT_EQUALS:
            return [
                isSingle
                    ? `${apiName} != ${toLiteral(apiName, first)}`
                    : `${apiName} NOT IN ${list()}`,
            ];
        // Several text matches are an OR, which GAQL only has as a regex.
        // The anchors hold whether or not it matches the whole value.
        case FilterOperator.INCLUDE:
            return [
                isSingle
                    ? like(`%${escapeLike(first)}%`)
                    : regex(`^.*${anyOf(values)}.*$`),
            ];
        case FilterOperator.STARTS_WITH:
            return [
                isSingle
                    ? like(`${escapeLike(first)}%`)
                    : regex(`^${anyOf(values)}.*$`),
            ];
        case FilterOperator.ENDS_WITH:
            return [
                isSingle
                    ? like(`%${escapeLike(first)}`)
                    : regex(`^.*${anyOf(values)}$`),
            ];
        case FilterOperator.NOT_INCLUDE:
            return values.map(
                (value) =>
                    `${apiName} NOT LIKE ${quote(`%${escapeLike(value)}%`)}`,
            );
        default:
            throw new ParameterError(
                `"${rule.target.fieldId}" can't be filtered with "${rule.operator}".`,
            );
    }
};

const toMetricValue = (apiName: string, value: unknown) => {
    const number = Number(value);
    if (value === null || value === '' || !Number.isFinite(number)) {
        throw new ParameterError(`"${String(value)}" isn't a number.`);
    }
    return GOOGLE_ADS_MICROS_FIELDS.has(apiName)
        ? Math.round(number * 1_000_000)
        : number;
};

const toMetricConditions = (apiName: string, rule: FilterRule): string[] => {
    const values = (rule.values ?? []).map((value) =>
        toMetricValue(apiName, value),
    );
    const compare = (operator: string) => {
        if (values.length !== 1) {
            throw new ParameterError(
                `Filter "${rule.target.fieldId}" by one value at a time.`,
            );
        }
        return [`${apiName} ${operator} ${values[0]}`];
    };
    switch (rule.operator) {
        case FilterOperator.GREATER_THAN:
            return compare('>');
        case FilterOperator.GREATER_THAN_OR_EQUAL:
            return compare('>=');
        case FilterOperator.LESS_THAN:
            return compare('<');
        case FilterOperator.LESS_THAN_OR_EQUAL:
            return compare('<=');
        case FilterOperator.IN_BETWEEN: {
            const [from, to] = values;
            if (from === undefined || to === undefined) {
                throw new ParameterError(
                    `"between" on "${rule.target.fieldId}" needs two numbers.`,
                );
            }
            return [`${apiName} >= ${from}`, `${apiName} <= ${to}`];
        }
        default:
            throw new ParameterError(
                `"${rule.target.fieldId}" can't be filtered with "${rule.operator}".`,
            );
    }
};

/**
 * A GAQL report returns one row per resource and segment; it never rolls up
 * across them, and the API has no GROUP BY. Asked for campaign status alone
 * it answers one row per campaign, which reads like a grouped total but
 * isn't. So every row must be identified by what was selected, and filters
 * finer than the selection are refused.
 */
const getGrainIssues = ({
    apiSource,
    metricQuery,
    filterRules,
    selected,
    resource,
    labelOf,
}: {
    apiSource: ApiSourceExplore;
    metricQuery: MetricQuery;
    filterRules: FilterRule[];
    selected: Set<string>;
    resource: GoogleAdsResource;
    labelOf: (fieldId: string) => string;
}): ApiSourceQueryIssue[] => {
    const apiName = (fieldId: string) => getApiName(apiSource, fieldId);
    const firstAt = (level: GoogleAdsResource) =>
        metricQuery.dimensions.find(
            (fieldId) => getResource(apiName(fieldId)) === level,
        ) ?? '';
    const identityIssues = (): ApiSourceQueryIssue[] => {
        const hasCampaign =
            selected.has('campaign.id') || selected.has('campaign.name');
        if (
            resource === 'ad_group' &&
            !selected.has('ad_group.id') &&
            !(selected.has('ad_group.name') && hasCampaign)
        ) {
            const fieldId = firstAt('ad_group');
            return [
                toFieldCombinationIssue(
                    fieldId,
                    `Google Ads returns one row per ad group and can't group them by ${labelOf(fieldId)}. Add Ad group ID, or Ad group name with Campaign name.`,
                ),
            ];
        }
        if (resource === 'campaign' && !hasCampaign) {
            const fieldId = firstAt('campaign');
            return [
                toFieldCombinationIssue(
                    fieldId,
                    `Google Ads returns one row per campaign and can't group them by ${labelOf(fieldId)}. Add Campaign name or Campaign ID.`,
                ),
            ];
        }
        return [];
    };
    const filterIssues = filterRules.flatMap((rule): ApiSourceQueryIssue[] => {
        const { fieldId } = rule.target;
        const name = apiName(fieldId);
        if (isSegment(name) && !selected.has(name)) {
            return [
                toFieldCombinationIssue(
                    fieldId,
                    `Google Ads only filters by ${labelOf(fieldId)} when it's also in the results. Add ${labelOf(fieldId)} to the query.`,
                ),
            ];
        }
        const filterResource = getResource(name);
        if (
            filterResource &&
            isFinerLevel(RESOURCES, filterResource, resource)
        ) {
            return [
                toFieldCombinationIssue(
                    fieldId,
                    `Filtering by ${labelOf(fieldId)} splits the results by ${filterResource.replace('_', ' ')}, and Google Ads can't add them back into one total. Add ${labelOf(fieldId)} to the query.`,
                ),
            ];
        }
        return [];
    });
    return [...identityIssues(), ...filterIssues];
};

/**
 * Compiles a metric query on a Google Ads explore into one GAQL report.
 * `today` only resolves relative date filters; the range itself is read in
 * the account's time zone, which the API applies.
 */
export const compileGoogleAdsQuery = ({
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
    const { startDate, endDate, otherFilters } = resolveAbsoluteDateRange({
        dateRange: apiSource.dateRange ?? undefined,
        filters: metricQuery.filters.dimensions,
        today,
    });
    const dimensionRules = getActiveFilterRules(otherFilters);
    const metricRules = getActiveFilterRules(metricQuery.filters.metrics);

    const dimensionsById = new Map(
        getDimensions(explore).map((dimension) => [
            getItemId(dimension),
            dimension,
        ]),
    );
    const labelOf = (fieldId: string) =>
        dimensionsById.get(fieldId)?.label ?? fieldId;
    const selectedDimensions = metricQuery.dimensions.map(apiName);
    const fromResource =
        getFinestLevel(RESOURCES, selectedDimensions.map(getResource)) ??
        ('customer' as GoogleAdsResource);
    const issues = getGrainIssues({
        apiSource,
        metricQuery,
        filterRules: dimensionRules,
        selected: new Set(selectedDimensions),
        resource: fromResource,
        labelOf,
    });
    if (issues.length > 0) {
        throw toApiSourceQueryError(issues);
    }

    const conditions = [
        `segments.date BETWEEN ${quote(startDate)} AND ${quote(endDate)}`,
        ...dimensionRules.flatMap((rule) =>
            toDimensionConditions(apiName(rule.target.fieldId), rule),
        ),
        ...metricRules.flatMap((rule) =>
            toMetricConditions(apiName(rule.target.fieldId), rule),
        ),
    ];
    const selectedMetrics =
        metricQuery.metrics.length > 0
            ? metricQuery.metrics.map(apiName)
            : [DIMENSION_ONLY_METRIC];
    const orderBy = metricQuery.sorts
        .map(
            ({ fieldId, descending }) =>
                `${apiName(fieldId)} ${descending ? 'DESC' : 'ASC'}`,
        )
        .join(', ');
    const requestLimit = metricQuery.limit;
    const query = [
        `SELECT ${[...selectedDimensions, ...selectedMetrics].join(', ')}`,
        `FROM ${fromResource}`,
        `WHERE ${conditions.join(' AND ')}`,
        ...(orderBy ? [`ORDER BY ${orderBy}`] : []),
        `LIMIT ${requestLimit}`,
    ].join(' ');

    return {
        query,
        requestLimit,
        limit: metricQuery.limit,
        fieldIdsByColumn: Object.fromEntries(
            [...metricQuery.dimensions, ...metricQuery.metrics].map(
                (fieldId) => [apiName(fieldId), fieldId],
            ),
        ),
        localSorts: [],
        // Week, month and quarter already arrive as their first day
        periodColumns: selectedDimensions.includes('segments.year')
            ? { 'segments.year': 'year' }
            : {},
    };
};
