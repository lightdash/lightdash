import moment from 'moment-timezone';
import {
    DimensionType,
    isDimension,
    type Field,
    type FilterableItem,
    type ItemsMap,
} from '../types/field';
import {
    FilterOperator,
    UnitOfTime,
    type DashboardFieldTarget,
    type DashboardFilterBoundary,
    type DashboardFilters,
    type DateFilterSettings,
    type FilterRule,
} from '../types/filter';
import { TimeFrames } from '../types/timeFrames';
import assertUnreachable from './assertUnreachable';
import { formatDate } from './formatting';
import {
    DEFAULT_UI_STRINGS,
    interpolateUiString,
    type UiStringResolver,
} from './i18n/uiStrings';
import { getMomentDateWithCustomStartOfWeek } from './time';
import { type WeekDay } from './timeFrames';

export type FilterBoundaryContext = {
    timezone?: string;
    useTimezoneAwareDateTrunc?: boolean;
    now?: Date;
    startOfWeek?: WeekDay | null;
    caseSensitive?: boolean;
    fieldType?: DimensionType;
    selectedPeriod?: DateFilterSettings['selectedPeriod'];
    fieldGranularity?: UnitOfTime;
    getUiString?: UiStringResolver;
};

type BoundaryRule = FilterRule<
    FilterOperator,
    unknown,
    unknown,
    DateFilterSettings
>;

type DateInterval = { start: number; end: number; endInclusive: boolean };

const getBoundaryTimezone = (context: FilterBoundaryContext): string =>
    context.fieldType === DimensionType.DATE &&
    !context.useTimezoneAwareDateTrunc
        ? 'UTC'
        : (context.timezone ?? 'UTC');

export const getBoundaryOperators = (
    boundary: DashboardFilterBoundary,
): FilterOperator[] => {
    switch (boundary.type) {
        case 'string':
            return [FilterOperator.EQUALS];
        case 'number':
            return [FilterOperator.EQUALS, FilterOperator.IN_BETWEEN];
        case 'date':
            return [
                FilterOperator.EQUALS,
                FilterOperator.IN_BETWEEN,
                FilterOperator.IN_THE_PAST,
                FilterOperator.IN_THE_NEXT,
                FilterOperator.IN_THE_CURRENT,
            ];
        default:
            return assertUnreachable(boundary, 'Unknown filter boundary');
    }
};

/** Uses the same calendar arithmetic and inclusive/completed endpoints as date filter SQL. */
const resolveRelativeInstantInterval = (
    rule: Pick<BoundaryRule, 'operator' | 'values' | 'settings'>,
    {
        timezone = 'UTC',
        startOfWeek,
        now = new Date(),
    }: FilterBoundaryContext = {},
): DateInterval | null => {
    const settings: DateFilterSettings = rule.settings ?? {};
    const unit = settings.unitOfTime ?? UnitOfTime.days;
    if (!Object.values(UnitOfTime).includes(unit) || !moment.tz.zone(timezone))
        return null;
    const current = getMomentDateWithCustomStartOfWeek(startOfWeek, now).tz(
        timezone,
    );
    const value = Number(rule.values?.[0]);
    if (
        rule.operator !== FilterOperator.IN_THE_CURRENT &&
        (!Number.isFinite(value) || value <= 0)
    )
        return null;
    switch (rule.operator) {
        case FilterOperator.IN_THE_PAST:
        case FilterOperator.NOT_IN_THE_PAST: {
            const end = settings.completed ? current.startOf(unit) : current;
            return {
                start: end.clone().subtract(value, unit).valueOf(),
                end: end.valueOf(),
                endInclusive: !settings.completed,
            };
        }
        case FilterOperator.IN_THE_NEXT: {
            const start = settings.completed
                ? current.add(1, unit).startOf(unit)
                : current;
            return {
                start: start.valueOf(),
                end: start.clone().add(value, unit).valueOf(),
                endInclusive: !settings.completed,
            };
        }
        case FilterOperator.IN_THE_CURRENT:
        case FilterOperator.NOT_IN_THE_CURRENT:
            return {
                start: current.clone().startOf(unit).valueOf(),
                end: current.endOf(unit).valueOf(),
                endInclusive: true,
            };
        default:
            return null;
    }
};

export const resolveRelativeDateFilterInterval = (
    rule: Pick<BoundaryRule, 'operator' | 'values' | 'settings'>,
    context: FilterBoundaryContext = {},
): DateInterval | null => {
    const timezone = getBoundaryTimezone(context);
    const interval = resolveRelativeInstantInterval(rule, {
        ...context,
        timezone,
    });
    if (!interval || context.fieldType !== DimensionType.DATE) return interval;
    return {
        start: moment.tz(interval.start, timezone).startOf('day').valueOf(),
        end: interval.endInclusive
            ? moment
                  .tz(interval.end, timezone)
                  .startOf('day')
                  .add(1, 'day')
                  .valueOf()
            : moment.tz(interval.end, timezone).startOf('day').valueOf(),
        endInclusive: false,
    };
};

const parseCalendarDate = (value: string, timezone: string) =>
    moment.tz(value, 'YYYY-MM-DD', true, timezone);

export const resolveFilterBoundaryInterval = (
    boundary: Extract<DashboardFilterBoundary, { type: 'date' }>,
    context: FilterBoundaryContext = {},
): DateInterval | null => {
    if (boundary.mode === 'relative') {
        return resolveRelativeDateFilterInterval(
            {
                operator: FilterOperator.IN_THE_PAST,
                values: [boundary.value],
                settings: {
                    unitOfTime: boundary.unitOfTime,
                    completed: boundary.completed,
                },
            },
            context,
        );
    }
    const timezone = getBoundaryTimezone(context);
    const start = parseCalendarDate(boundary.start, timezone);
    const end = parseCalendarDate(boundary.end, timezone);
    return start.isValid() && end.isValid() && !end.isBefore(start)
        ? {
              start: start.valueOf(),
              end: end.add(1, 'day').valueOf(),
              endInclusive: false,
          }
        : null;
};

export const getFilterBoundaryMessage = (
    boundary: DashboardFilterBoundary,
    getUiString: UiStringResolver = (key) => DEFAULT_UI_STRINGS[key],
): string => {
    switch (boundary.type) {
        case 'number':
            return interpolateUiString(
                getUiString('filters.boundaries.number'),
                { min: boundary.min, max: boundary.max },
            );
        case 'string':
            return interpolateUiString(
                getUiString('filters.boundaries.string'),
                { values: boundary.values.join(', ') },
            );
        case 'date':
            return boundary.mode === 'fixed'
                ? interpolateUiString(
                      getUiString('filters.boundaries.fixedDate'),
                      { start: boundary.start, end: boundary.end },
                  )
                : interpolateUiString(
                      getUiString(
                          boundary.completed
                              ? 'filters.boundaries.completedDate'
                              : 'filters.boundaries.relativeDate',
                      ),
                      {
                          value: boundary.value,
                          unit: getUiString(
                              `filters.unitsOfTime.${boundary.unitOfTime}.${boundary.value === 1 ? 'singular' : 'plural'}`,
                          ),
                      },
                  );
        default:
            return assertUnreachable(boundary, 'Unknown filter boundary');
    }
};

export const isValidFilterBoundary = (
    boundary: DashboardFilterBoundary,
): boolean => {
    switch (boundary.type) {
        case 'number':
            return (
                Number.isFinite(boundary.min) &&
                Number.isFinite(boundary.max) &&
                boundary.min <= boundary.max
            );
        case 'string':
            return (
                boundary.values.length > 0 &&
                boundary.values.every((value) => typeof value === 'string')
            );
        case 'date':
            return boundary.mode === 'relative'
                ? Number.isInteger(boundary.value) &&
                      boundary.value > 0 &&
                      Object.values(UnitOfTime).includes(boundary.unitOfTime)
                : resolveFilterBoundaryInterval(boundary) !== null;
        default:
            return assertUnreachable(boundary, 'Unknown filter boundary');
    }
};

const resolveDateSelection = (
    rule: BoundaryRule,
    context: FilterBoundaryContext,
): DateInterval[] | null => {
    const timezone = getBoundaryTimezone(context);
    const periods = [
        UnitOfTime.weeks,
        UnitOfTime.months,
        UnitOfTime.quarters,
        UnitOfTime.years,
    ];
    const requestedPeriod = rule.settings?.selectedPeriod;
    if (requestedPeriod && !periods.includes(requestedPeriod)) return null;
    const fieldPeriod = context.fieldGranularity ?? context.selectedPeriod;
    const units = Object.values(UnitOfTime);
    const period =
        units.indexOf(fieldPeriod!) > units.indexOf(requestedPeriod!)
            ? fieldPeriod
            : requestedPeriod;
    const relative = resolveRelativeDateFilterInterval(rule, context);
    if (relative) {
        if (!period) return [relative];
        const start = getMomentDateWithCustomStartOfWeek(
            context.startOfWeek,
            moment.tz(relative.start, timezone),
        ).startOf(period);
        if (start.valueOf() < relative.start) start.add(1, period);
        const last = getMomentDateWithCustomStartOfWeek(
            context.startOfWeek,
            moment.tz(relative.end - (relative.endInclusive ? 0 : 1), timezone),
        ).startOf(period);
        if (start.isAfter(last)) return null;
        return [
            {
                start: start.valueOf(),
                end: last.add(1, period).valueOf(),
                endInclusive: false,
            },
        ];
    }
    const intervals = (rule.values ?? []).map(
        (value: unknown): DateInterval | null => {
            if (typeof value !== 'string') return null;
            // Period values encode a calendar date, not an instant in the browser timezone.
            if (!moment(value, moment.ISO_8601, true).isValid()) return null;
            let calendarValue = value;
            if (context.fieldType === DimensionType.DATE) {
                calendarValue = formatDate(value);
            } else if (
                period &&
                units.indexOf(period) >= units.indexOf(UnitOfTime.days)
            ) {
                calendarValue = formatDate(value, TimeFrames.DAY, true);
            }
            const date = getMomentDateWithCustomStartOfWeek(
                context.startOfWeek,
                moment.tz(calendarValue, moment.ISO_8601, true, timezone),
            );
            if (!date.isValid()) return null;
            if (period) {
                date.startOf(period);
                return {
                    start: date.valueOf(),
                    end: date.clone().add(1, period).valueOf(),
                    endInclusive: false,
                };
            }
            if (
                context.fieldType === DimensionType.DATE ||
                /^\d{4}-\d{2}-\d{2}$/.test(value)
            ) {
                date.startOf('day');
                return {
                    start: date.valueOf(),
                    end: date.clone().add(1, 'day').valueOf(),
                    endInclusive: false,
                };
            }
            return {
                start: date.valueOf(),
                end: date.valueOf(),
                endInclusive: true,
            };
        },
    );
    if (!intervals.length || intervals.some((interval) => interval === null))
        return null;
    const valid = intervals as DateInterval[];
    if (rule.operator === FilterOperator.IN_BETWEEN) {
        if (valid.length !== 2 || valid[0].start > valid[1].start) return null;
        return [
            {
                start: valid[0].start,
                end: valid[1].end,
                endInclusive: valid[1].endInclusive,
            },
        ];
    }
    return rule.operator === FilterOperator.EQUALS ? valid : null;
};

export const validateFilterBoundary = (
    boundary: DashboardFilterBoundary | undefined,
    rule: BoundaryRule | undefined,
    context: FilterBoundaryContext = {},
): string | null => {
    if (!boundary) return null;
    const getUiString =
        context.getUiString ?? ((key) => DEFAULT_UI_STRINGS[key]);
    if (!isValidFilterBoundary(boundary))
        return getUiString('filters.boundaries.invalidConfiguration');
    const message = getFilterBoundaryMessage(boundary, getUiString);
    if (
        !rule ||
        rule.disabled ||
        rule.includeNull ||
        !getBoundaryOperators(boundary).includes(rule.operator)
    )
        return message;
    const values: unknown[] = rule.values ?? [];
    switch (boundary.type) {
        case 'string': {
            const normalize = (value: string) =>
                (rule.caseSensitive ?? context.caseSensitive ?? true)
                    ? value
                    : value.toUpperCase();
            return values.length &&
                values.every(
                    (value) =>
                        typeof value === 'string' &&
                        boundary.values.some(
                            (allowed) =>
                                normalize(allowed) === normalize(value),
                        ),
                )
                ? null
                : message;
        }
        case 'number':
            if (
                !values.length ||
                values.some(
                    (value) =>
                        !['number', 'string'].includes(typeof value) ||
                        String(value).trim() === '' ||
                        !Number.isFinite(Number(value)) ||
                        Number(value) < boundary.min ||
                        Number(value) > boundary.max,
                )
            )
                return message;
            if (
                rule.operator === FilterOperator.IN_BETWEEN &&
                (values.length !== 2 || Number(values[0]) > Number(values[1]))
            )
                return message;
            return null;
        case 'date': {
            const stableContext = {
                ...context,
                now: context.now ?? new Date(),
            };
            const allowed = resolveFilterBoundaryInterval(
                boundary,
                stableContext,
            );
            const selections = resolveDateSelection(rule, stableContext);
            return allowed &&
                selections?.every(
                    (selection) =>
                        selection.start >= allowed.start &&
                        (selection.end < allowed.end ||
                            (selection.end === allowed.end &&
                                (!selection.endInclusive ||
                                    allowed.endInclusive))),
                )
                ? null
                : message;
        }
        default:
            return assertUnreachable(boundary, 'Unknown filter boundary');
    }
};

export const getDashboardBoundaryErrors = (
    saved: DashboardFilters,
    effective: DashboardFilters,
    tileUuid: string,
    availableFieldIds: string[],
    getContext: (
        target: DashboardFieldTarget,
    ) => FilterBoundaryContext = () => ({}),
): string[] => {
    const errors: string[] = [];
    const now = new Date();
    for (const kind of [
        'dimensions',
        'metrics',
        'tableCalculations',
    ] as const) {
        saved[kind].forEach((savedRule) => {
            if (
                !savedRule.boundaries ||
                savedRule.tileTargets?.[tileUuid] === false
            )
                return;
            const target =
                savedRule.tileTargets?.[tileUuid] || savedRule.target;
            if (!availableFieldIds.includes(target.fieldId)) return;
            const candidates = effective[kind].filter(
                (candidate) =>
                    candidate.id === savedRule.id ||
                    (candidate.target.fieldId === savedRule.target.fieldId &&
                        candidate.target.tableName ===
                            savedRule.target.tableName) ||
                    (candidate.target.fieldId === target.fieldId &&
                        candidate.target.tableName === target.tableName),
            );
            const context = { now, ...getContext(target) };
            if (!candidates.length) {
                errors.push(
                    getFilterBoundaryMessage(
                        savedRule.boundaries,
                        context.getUiString,
                    ),
                );
                return;
            }
            for (const candidate of candidates) {
                const candidateTarget =
                    candidate.tileTargets?.[tileUuid] ?? candidate.target;
                const isApplied =
                    candidateTarget !== false &&
                    candidateTarget.fieldId === target.fieldId &&
                    candidateTarget.tableName === target.tableName &&
                    (!target.isSqlColumn ||
                        (candidateTarget.isSqlColumn &&
                            !!candidate.tileTargets?.[tileUuid]));
                const error = validateFilterBoundary(
                    savedRule.boundaries,
                    isApplied ? candidate : undefined,
                    context,
                );
                if (error) errors.push(error);
            }
        });
    }
    return errors;
};

export const getFilterBoundaryFieldContext = (
    field: FilterableItem | ItemsMap[string] | Field | undefined,
    exploreCaseSensitive?: boolean,
): FilterBoundaryContext => {
    const periods: Partial<
        Record<TimeFrames, DateFilterSettings['selectedPeriod']>
    > = {
        [TimeFrames.WEEK]: UnitOfTime.weeks,
        [TimeFrames.MONTH]: UnitOfTime.months,
        [TimeFrames.QUARTER]: UnitOfTime.quarters,
        [TimeFrames.YEAR]: UnitOfTime.years,
    };
    const granularities: Partial<Record<TimeFrames, UnitOfTime>> = {
        ...periods,
        [TimeFrames.DAY]: UnitOfTime.days,
        [TimeFrames.HOUR]: UnitOfTime.hours,
        [TimeFrames.MINUTE]: UnitOfTime.minutes,
        [TimeFrames.SECOND]: UnitOfTime.seconds,
    };
    return {
        fieldGranularity:
            isDimension(field) && field.timeInterval
                ? granularities[field.timeInterval]
                : undefined,
        caseSensitive: isDimension(field)
            ? (field.caseSensitive ?? exploreCaseSensitive)
            : exploreCaseSensitive,
        fieldType: isDimension(field) ? field.type : undefined,
        selectedPeriod:
            isDimension(field) && field.timeInterval
                ? periods[field.timeInterval]
                : undefined,
    };
};

/** Restore author-owned metadata without replacing a viewer's selection. Missing rules stay visible for correction. */
export const restoreDashboardFilterBoundaries = (
    saved: DashboardFilters,
    effective: DashboardFilters,
): DashboardFilters => {
    const restored = { ...effective };
    for (const kind of [
        'dimensions',
        'metrics',
        'tableCalculations',
    ] as const) {
        const rules = [...effective[kind]];
        saved[kind].forEach((savedRule) => {
            if (!savedRule.boundaries) return;
            const index = rules.findIndex(
                (candidate) =>
                    candidate.id === savedRule.id ||
                    (candidate.target.fieldId === savedRule.target.fieldId &&
                        candidate.target.tableName ===
                            savedRule.target.tableName),
            );
            if (index < 0) {
                rules.push({ ...savedRule, values: [], disabled: true });
            } else {
                rules[index] = {
                    ...rules[index],
                    id: savedRule.id,
                    boundaries: savedRule.boundaries,
                    target: savedRule.target,
                    tileTargets: savedRule.tileTargets,
                };
            }
        });
        restored[kind] = rules;
    }
    return restored;
};
