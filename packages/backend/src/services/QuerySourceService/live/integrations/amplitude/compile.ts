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
import { isAmplitudeUserProperty } from './explores';
import {
    AMPLITUDE_MAX_EVENTS,
    AMPLITUDE_MAX_FUNNEL_STEPS,
    AMPLITUDE_SEGMENTATION_METRICS,
    AMPLITUDE_SESSION_METRICS,
    AMPLITUDE_USER_METRICS,
    DEFAULT_CONVERSION_WINDOW_DAYS,
    type AmplitudeRequest,
} from './run';

const refuse = (fieldId: FieldId | null, message: string) =>
    toLiveQueryError([toFieldCombinationIssue(fieldId, message)]);

const INTERVALS = { date: 1, week: 7, month: 30 } as const;
type Interval = (typeof INTERVALS)[keyof typeof INTERVALS];

const toApiKey = <T extends Record<string, string>>(
    columns: T,
    apiName: string,
): keyof T | undefined =>
    (Object.keys(columns) as (keyof T)[]).find(
        (key) => columns[key] === apiName,
    );

type Segment = { prop: string; op: 'is' | 'is not'; values: string[] };

/**
 * Splits a query's selected fields and filters into what one Amplitude
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
    const segments: Segment[] = [];
    const eventFilters = new Map<
        string,
        { rule: FilterRule; values: string[] }
    >();
    rules.forEach((rule) => {
        const name = apiName(rule.target.fieldId);
        const values = (rule.values ?? []).map(String);
        if (isAmplitudeUserProperty(name)) {
            segments.push({
                prop: name,
                op:
                    rule.operator === FilterOperator.NOT_EQUALS
                        ? 'is not'
                        : 'is',
                values,
            });
            return;
        }
        if (eventFilters.has(name)) {
            throw refuse(
                rule.target.fieldId,
                `Filter "${rule.target.fieldId}" once: Amplitude reads one list of values for it.`,
            );
        }
        eventFilters.set(name, { rule, values });
    });

    const dimensions = metricQuery.dimensions.map((fieldId) => ({
        fieldId,
        name: apiName(fieldId),
    }));
    const dateGrains = dimensions.filter(({ name }) =>
        Object.hasOwn(INTERVALS, name),
    );
    if (dateGrains.length > 1) {
        throw refuse(
            dateGrains[1].fieldId,
            `"${dateGrains[0].fieldId}" can't be combined with "${dateGrains[1].fieldId}": Amplitude reports one date grain per query.`,
        );
    }
    const properties = dimensions.filter(({ name }) =>
        isAmplitudeUserProperty(name),
    );
    if (properties.length > 1) {
        throw refuse(
            properties[1].fieldId,
            `"${properties[0].fieldId}" can't be combined with "${properties[1].fieldId}": Amplitude groups by one user property at a time.`,
        );
    }
    const metrics = metricQuery.metrics.map(apiName);
    if (metrics.length === 0) {
        throw new ParameterError('Pick at least one Amplitude metric.');
    }
    const grain = dateGrains[0];
    return {
        start: startDate,
        end: endDate,
        segments,
        eventFilters,
        dimensions,
        metrics,
        interval: grain
            ? (INTERVALS[grain.name as keyof typeof INTERVALS] as Interval)
            : null,
        groupBy: properties[0]?.name ?? null,
    };
};

type ReadQuery = ReturnType<typeof readQuery>;

const rangeOf = ({ start, end, segments }: ReadQuery) => ({
    start,
    end,
    ...(segments.length > 0 ? { segments } : {}),
});

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

const toSegmentation = (query: ReadQuery): AmplitudeRequest => {
    assertDimensions(
        query,
        (name) =>
            name === 'event_type' ||
            Object.hasOwn(INTERVALS, name) ||
            isAmplitudeUserProperty(name),
        "can't be grouped by in Amplitude event segmentation.",
    );
    const events = query.eventFilters.get('event_type')?.values ?? ['_all'];
    if (events.length > AMPLITUDE_MAX_EVENTS) {
        throw refuse(
            null,
            `Filter Event to at most ${AMPLITUDE_MAX_EVENTS} events: Amplitude reads one at a time.`,
        );
    }
    const hasEventDimension = query.dimensions.some(
        ({ name }) => name === 'event_type',
    );
    if (events.length > 1 && !hasEventDimension) {
        throw refuse(
            null,
            "Add Event to the dimensions to compare several events: Amplitude counts unique users per event, and they can't be added together.",
        );
    }
    return {
        endpoint: 'segmentation',
        ...rangeOf(query),
        interval: query.interval,
        events,
        metrics: query.metrics.map((metric) => {
            const key = toApiKey(AMPLITUDE_SEGMENTATION_METRICS, metric);
            if (!key) throw new ParameterError(`Unknown metric "${metric}"`);
            return key;
        }),
        groupBy: query.groupBy,
    };
};

const toUsers = (query: ReadQuery): AmplitudeRequest => {
    if (query.interval === null) {
        throw refuse(
            null,
            'Add Date, Date week or Date month: Amplitude counts active users per day, week or month.',
        );
    }
    return {
        endpoint: 'users',
        ...rangeOf(query),
        interval: query.interval,
        metrics: query.metrics.map((metric) => {
            const key = toApiKey(AMPLITUDE_USER_METRICS, metric);
            if (!key) throw new ParameterError(`Unknown metric "${metric}"`);
            return key;
        }),
        groupBy: query.groupBy,
    };
};

const toFunnel = (query: ReadQuery): AmplitudeRequest => {
    assertDimensions(
        query,
        (name) => name === 'step_number' || name === 'step_event',
        'only filters a funnel: Amplitude computes it over the whole date range.',
    );
    const steps = query.eventFilters.get('step_event')?.values ?? [];
    if (steps.length < 2 || steps.length > AMPLITUDE_MAX_FUNNEL_STEPS) {
        throw refuse(
            null,
            `Filter Step event to the funnel steps in order, from 2 to ${AMPLITUDE_MAX_FUNNEL_STEPS} events.`,
        );
    }
    const window = query.eventFilters.get('conversion_window_days');
    const conversionWindowDays = window
        ? Number(window.values[0])
        : DEFAULT_CONVERSION_WINDOW_DAYS;
    if (
        !Number.isInteger(conversionWindowDays) ||
        conversionWindowDays < 1 ||
        conversionWindowDays > 366 ||
        (window?.values.length ?? 1) > 1
    ) {
        throw refuse(
            window?.rule.target.fieldId ?? null,
            'Set the conversion window to one whole number of days, from 1 to 366.',
        );
    }
    return {
        endpoint: 'funnel',
        ...rangeOf(query),
        steps,
        conversionWindowDays,
    };
};

const RETENTION_UNITS = {
    days_after: 1,
    weeks_after: 7,
    months_after: 30,
} as const;

const toRetention = (
    query: ReadQuery,
    explore: Explore,
    metricQuery: MetricQuery,
): AmplitudeRequest => {
    assertDimensions(
        query,
        (name) => name === 'period' || Object.hasOwn(INTERVALS, name),
        'only filters retention.',
    );
    const periodIds = metricQuery.dimensions.filter(
        (fieldId) =>
            query.dimensions.find((d) => d.fieldId === fieldId)?.name ===
            'period',
    );
    const unitOf = (fieldId: FieldId) =>
        Object.entries(RETENTION_UNITS).find(([name]) =>
            fieldId.endsWith(`_${name}`),
        )?.[1];
    if (periodIds.length !== 1 || !unitOf(periodIds[0])) {
        throw refuse(
            periodIds[1] ?? null,
            'Add one of Days, Weeks or Months after start: it sets the retention grain.',
        );
    }
    const interval = unitOf(periodIds[0]) as Interval;
    if (query.interval !== null && query.interval !== interval) {
        throw refuse(
            periodIds[0],
            'Match the cohort grain to the retention period: Amplitude uses one grain for both.',
        );
    }
    const single = (name: string, fallback: string) => {
        const filter = query.eventFilters.get(name);
        if (filter && filter.values.length !== 1) {
            throw refuse(
                filter.rule.target.fieldId,
                `Filter "${filter.rule.target.fieldId}" to one event.`,
            );
        }
        return filter?.values[0] ?? fallback;
    };
    return {
        endpoint: 'retention',
        ...rangeOf(query),
        interval,
        startEvent: single('start_event', '_new'),
        returnEvent: single('return_event', '_active'),
        byCohort: query.interval !== null,
    };
};

const toSessions = (query: ReadQuery): AmplitudeRequest => {
    if (query.segments.length > 0) {
        throw refuse(
            null,
            "Amplitude's session reports can't be filtered by user property.",
        );
    }
    if (query.interval !== 1) {
        throw refuse(null, 'Add Date: Amplitude reports sessions per day.');
    }
    return {
        endpoint: 'sessions',
        start: query.start,
        end: query.end,
        metrics: query.metrics.map((metric) => {
            const key = toApiKey(AMPLITUDE_SESSION_METRICS, metric);
            if (!key) throw new ParameterError(`Unknown metric "${metric}"`);
            return key;
        }),
    };
};

/**
 * Compiles a metric query on an Amplitude explore into one Dashboard API
 * report. Amplitude can't sort, so every sort runs on the returned rows.
 */
export const compileAmplitudeQuery = ({
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
            case 'events':
                return toSegmentation(query);
            case 'users':
                return toUsers(query);
            case 'funnel':
                return toFunnel(query);
            case 'retention':
                return toRetention(query, explore, metricQuery);
            case 'sessions':
                return toSessions(query);
            default:
                throw new ParameterError(
                    `"${explore.name}" isn't an Amplitude explore`,
                );
        }
    })();
    return {
        query: JSON.stringify(request),
        localSorts: metricQuery.sorts,
    };
};
