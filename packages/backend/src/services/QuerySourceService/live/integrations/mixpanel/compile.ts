import {
    FilterOperator,
    ParameterError,
    type Explore,
    type FieldId,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import {
    getActiveFilterRules,
    getApiName,
    getLiveDefinitionName,
    getLiveExplore,
    toFieldCombinationIssue,
    toLiveQueryError,
    type LiveCompiledRequest,
} from '../../explores/definition';
import { resolveAbsoluteDateRange } from '../../query/dateRange';
import { isMixpanelProperty, type MixpanelProperty } from './explores';
import {
    getRetentionPeriods,
    MIXPANEL_CALLS_PER_QUERY,
    MIXPANEL_MAX_EVENTS,
    MIXPANEL_SEGMENTATION_METRICS,
    type MixpanelRequest,
} from './run';

const refuse = (fieldId: FieldId | null, message: string) =>
    toLiveQueryError([toFieldCombinationIssue(fieldId, message)]);

const DATE_GRAINS = ['date', 'week', 'month'] as const;
type DateGrain = (typeof DATE_GRAINS)[number];
const isDateGrain = (name: string): name is DateGrain =>
    (DATE_GRAINS as readonly string[]).includes(name);

const toApiKey = <T extends Record<string, string>>(
    columns: T,
    apiName: string,
): keyof T | undefined =>
    (Object.keys(columns) as (keyof T)[]).find(
        (key) => columns[key] === apiName,
    );

type PropertyFilter = {
    property: MixpanelProperty;
    op: 'is' | 'is not';
    values: string[];
};

/**
 * Splits a query's selected fields and filters into what one Mixpanel
 * report takes, refusing what it can't express.
 */
const readQuery = (
    explore: Explore,
    metricQuery: MetricQuery,
    today: string,
) => {
    const apiSource = getLiveExplore(explore);
    const apiName = (fieldId: FieldId) => getApiName(apiSource, fieldId);
    const { startDate, endDate, otherFilters } = resolveAbsoluteDateRange({
        dateRange: apiSource.dateRange ?? undefined,
        filters: metricQuery.filters.dimensions,
        today,
    });
    const rules = getActiveFilterRules(otherFilters);
    const propertyFilters: PropertyFilter[] = [];
    const valueFilters = new Map<
        string,
        { rule: FilterRule; values: string[] }
    >();
    rules.forEach((rule) => {
        const name = apiName(rule.target.fieldId);
        const values = (rule.values ?? []).map(String);
        if (isMixpanelProperty(name)) {
            propertyFilters.push({
                property: name,
                op:
                    rule.operator === FilterOperator.NOT_EQUALS
                        ? 'is not'
                        : 'is',
                values,
            });
            return;
        }
        if (valueFilters.has(name)) {
            throw refuse(
                rule.target.fieldId,
                `Filter "${rule.target.fieldId}" once: Mixpanel reads one list of values for it.`,
            );
        }
        valueFilters.set(name, { rule, values });
    });

    const dimensions = metricQuery.dimensions.map((fieldId) => ({
        fieldId,
        name: apiName(fieldId),
    }));
    const dateGrains = dimensions.filter(({ name }) => isDateGrain(name));
    if (dateGrains.length > 1) {
        throw refuse(
            dateGrains[1].fieldId,
            `"${dateGrains[0].fieldId}" can't be combined with "${dateGrains[1].fieldId}": Mixpanel reports one date grain per query.`,
        );
    }
    const properties = dimensions.filter(({ name }) =>
        isMixpanelProperty(name),
    );
    if (properties.length > 1) {
        throw refuse(
            properties[1].fieldId,
            `"${properties[0].fieldId}" can't be combined with "${properties[1].fieldId}": Mixpanel splits by one property at a time.`,
        );
    }
    const metrics = metricQuery.metrics.map(apiName);
    if (metrics.length === 0) {
        throw new ParameterError('Pick at least one Mixpanel metric.');
    }
    const grain = dateGrains[0]?.name as DateGrain | undefined;
    return {
        start: startDate,
        end: endDate,
        propertyFilters,
        valueFilters,
        dimensions,
        metrics,
        grain: grain ?? null,
        groupBy: (properties[0]?.name as MixpanelProperty | undefined) ?? null,
    };
};

type ReadQuery = ReturnType<typeof readQuery>;

/** Refuses selected fields the report can't group by. */
const assertDimensions = (
    query: ReadQuery,
    allowed: (name: string) => boolean,
    reason: string,
) => {
    const other = query.dimensions.find(({ name }) => !allowed(name));
    if (other) {
        throw refuse(other.fieldId, `"${other.fieldId}" ${reason}`);
    }
};

const assertNoPropertyFilters = (query: ReadQuery, report: string) => {
    if (query.propertyFilters.length > 0) {
        throw refuse(
            null,
            `Mixpanel's ${report} can't be filtered by property here yet.`,
        );
    }
};

const toSegmentation = (query: ReadQuery): MixpanelRequest => {
    assertDimensions(
        query,
        (name) =>
            name === 'event' ||
            name === 'date' ||
            name === 'month' ||
            isMixpanelProperty(name),
        "can't be grouped by in Mixpanel segmentation.",
    );
    const events = query.valueFilters.get('event')?.values ?? [];
    if (events.length === 0 || events.length > MIXPANEL_MAX_EVENTS) {
        throw refuse(
            null,
            `Filter Event to the events to count, from 1 to ${MIXPANEL_MAX_EVENTS}: Mixpanel reads one event per call.`,
        );
    }
    if (events.length * query.metrics.length > MIXPANEL_CALLS_PER_QUERY) {
        throw refuse(
            null,
            `Mixpanel reads one event and metric per call and allows 60 calls an hour: pick fewer events or metrics, at most ${MIXPANEL_CALLS_PER_QUERY} pairs.`,
        );
    }
    return {
        endpoint: 'segmentation',
        start: query.start,
        end: query.end,
        unit: (() => {
            if (query.grain === 'date') return 'day';
            if (query.grain === 'month') return 'month';
            return null;
        })(),
        events,
        metrics: query.metrics.map((metric) => {
            const key = toApiKey(MIXPANEL_SEGMENTATION_METRICS, metric);
            if (!key) throw new ParameterError(`Unknown metric "${metric}"`);
            return key;
        }),
        groupBy: query.groupBy,
        filters: query.propertyFilters,
    };
};

const toFunnel = (query: ReadQuery): MixpanelRequest => {
    assertDimensions(
        query,
        (name) => name === 'step_number' || name === 'step_event',
        'only filters a funnel: Mixpanel computes it over the whole date range.',
    );
    assertNoPropertyFilters(query, 'saved funnels');
    const filter = query.valueFilters.get('funnel_id');
    const funnelId = Number(filter?.values[0]);
    if (
        !filter ||
        filter.values.length !== 1 ||
        !Number.isInteger(funnelId) ||
        funnelId < 1
    ) {
        throw refuse(
            filter?.rule.target.fieldId ?? null,
            'Filter Funnel ID to one saved funnel: the number in the funnel report URL in Mixpanel.',
        );
    }
    return {
        endpoint: 'funnel',
        start: query.start,
        end: query.end,
        funnelId,
    };
};

const RETENTION_UNITS = {
    days_after: 'day',
    weeks_after: 'week',
    months_after: 'month',
} as const;
const COHORT_UNITS: Record<DateGrain, 'day' | 'week' | 'month'> = {
    date: 'day',
    week: 'week',
    month: 'month',
};

const toRetention = (
    query: ReadQuery,
    metricQuery: MetricQuery,
): MixpanelRequest => {
    assertDimensions(
        query,
        (name) => name === 'period' || isDateGrain(name),
        'only filters retention.',
    );
    assertNoPropertyFilters(query, 'retention');
    const periodIds = metricQuery.dimensions.filter(
        (fieldId) =>
            query.dimensions.find((d) => d.fieldId === fieldId)?.name ===
            'period',
    );
    const unitOf = (fieldId: FieldId) =>
        Object.entries(RETENTION_UNITS).find(([name]) =>
            fieldId.endsWith(`_${name}`),
        )?.[1];
    const unit = periodIds.length === 1 ? unitOf(periodIds[0]) : undefined;
    if (!unit) {
        throw refuse(
            periodIds[1] ?? null,
            'Add one of Days, Weeks or Months after start: it sets the retention grain.',
        );
    }
    if (query.grain === null) {
        throw refuse(
            null,
            'Add the cohort date at the same grain: Mixpanel reports retention per cohort.',
        );
    }
    if (COHORT_UNITS[query.grain] !== unit) {
        throw refuse(
            periodIds[0],
            'Match the cohort grain to the retention period: Mixpanel uses one grain for both.',
        );
    }
    // Mixpanel reads a capped number of periods; past it the later cohorts
    // would come back short, so the range is refused instead
    const periods = getRetentionPeriods(query.start, query.end, unit);
    if (periods.capped) {
        throw refuse(
            null,
            `Shorten the cohort date range: Mixpanel reads at most ${periods.max} ${unit}s after start, and this range needs ${periods.needed}.`,
        );
    }
    const single = (name: string) => {
        const filter = query.valueFilters.get(name);
        if (filter && filter.values.length !== 1) {
            throw refuse(
                filter.rule.target.fieldId,
                `Filter "${filter.rule.target.fieldId}" to one event.`,
            );
        }
        return filter?.values[0] ?? null;
    };
    return {
        endpoint: 'retention',
        start: query.start,
        end: query.end,
        unit,
        startEvent: single('start_event'),
        returnEvent: single('return_event'),
    };
};

/**
 * Compiles a metric query on a Mixpanel explore into one Query API report.
 * Mixpanel can't sort, so every sort runs on the returned rows.
 */
export const compileMixpanelQuery = ({
    explore,
    metricQuery,
    today,
}: {
    explore: Explore;
    metricQuery: MetricQuery;
    today: string;
}): LiveCompiledRequest => {
    const query = readQuery(explore, metricQuery, today);
    const request = (() => {
        const definition = getLiveDefinitionName(explore);
        switch (definition) {
            case 'top_events':
                return { endpoint: 'top_events' } as const;
            case 'events':
                return toSegmentation(query);
            case 'funnel':
                return toFunnel(query);
            case 'retention':
                return toRetention(query, metricQuery);
            default:
                throw new ParameterError(
                    `"${explore.name}" isn't a Mixpanel explore`,
                );
        }
    })();
    return {
        query: JSON.stringify(request),
        localSorts: metricQuery.sorts,
    };
};
