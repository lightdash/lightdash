import {
    assertUnreachable,
    extractableTimeFrames,
    isCalendarValueItem,
    isDimension,
    parseCalendarValueUTC,
    parseTimestampValueUTC,
    shouldShiftItemTimezone,
    TimeFrames,
    type CartesianChart,
    type ItemsMap,
} from '@lightdash/common';
import dayjs from 'dayjs';
import timezonePlugin from 'dayjs/plugin/timezone';
import utcPlugin from 'dayjs/plugin/utc';

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);

// Time intervals that benefit from category axis in bar charts.
// These must match intervals handled by getCategoryDateAxisConfig.
export const TIME_INTERVALS_FOR_CATEGORY_AXIS: TimeFrames[] = [
    TimeFrames.WEEK,
    TimeFrames.MONTH,
    TimeFrames.QUARTER,
    TimeFrames.YEAR,
];

export type TimezoneShiftedField = {
    fieldId: string;
    timezone: string;
    flipAxes: boolean;
};

type DetectedTimezoneAxisField = TimezoneShiftedField & {
    timeInterval: TimeFrames;
};

// The detected time-axis field. Every detected field is rewritten to its
// project-tz wall-clock (the 'shift' path) so ECharts places ticks and renders
// labels natively on the wall-clock timeline. Sub-day grains use this too: the
// merge bucketing collapses the DST fall-back to one bucket per wall-clock hour,
// so shifting no longer collides two instants onto the same position.
export type DetectedTimeAxisField = TimezoneShiftedField;

// timeAxisField is the single source of truth. axisDisplayTimezone is the
// formatter zone for the shifted (wall-clock) values; axisTimezone is the zone
// for the non-shifted fallback path (no detected field) where values stay UTC.
export type AxisTimezoneConfig = {
    timeAxisField: DetectedTimeAxisField | undefined;
    axisTimezone: string | undefined;
    axisDisplayTimezone: string | undefined;
};

const getTimezoneOffsetMs = (ms: number, timezone: string): number =>
    dayjs(ms).tz(timezone).utcOffset() * 60_000;

const shiftRawToTimezoneWallClockMs = (
    raw: unknown,
    timezone: string,
): number | undefined => {
    if (raw === null || raw === undefined) return undefined;
    let ms: number;
    if (typeof raw === 'number') ms = raw;
    else if (raw instanceof Date) ms = raw.getTime();
    else ms = new Date(String(raw)).getTime();
    if (!Number.isFinite(ms)) return undefined;
    return ms + getTimezoneOffsetMs(ms, timezone);
};

const detectTimezoneShiftedField = ({
    validCartesianConfig,
    itemsMap,
    resolvedTimezone,
}: {
    validCartesianConfig: CartesianChart | undefined;
    itemsMap: ItemsMap | undefined;
    resolvedTimezone: string | undefined;
}): DetectedTimezoneAxisField | undefined => {
    if (
        !resolvedTimezone ||
        resolvedTimezone === 'UTC' ||
        !validCartesianConfig ||
        !itemsMap
    ) {
        return undefined;
    }
    const flipAxes = !!validCartesianConfig.layout?.flipAxes;
    // xField is the semantic time dimension even when flipped: series encoding
    // and getEchartAxes both move it to the physical Y axis, keyed by fieldId.
    const timeFieldId = validCartesianConfig.layout?.xField;
    if (!timeFieldId) return undefined;
    const field = itemsMap[timeFieldId];
    if (!field || !isDimension(field)) return undefined;
    const timeInterval = field.timeInterval;
    if (!timeInterval) return undefined;
    // Skip non-timestamp axis values: category-axis intervals render as
    // strings, EXTRACT-based intervals return ints/names.
    if (
        TIME_INTERVALS_FOR_CATEGORY_AXIS.includes(timeInterval) ||
        extractableTimeFrames.has(timeInterval)
    ) {
        return undefined;
    }
    // Honor the same opt-out as the table and exports: calendar DATEs and
    // skipTimezoneConversion dims are not shiftable instants.
    if (!shouldShiftItemTimezone(field)) {
        return undefined;
    }
    return {
        fieldId: timeFieldId,
        timezone: resolvedTimezone,
        flipAxes,
        timeInterval,
    };
};

export const resolveAxisTimezone = (params: {
    validCartesianConfig: CartesianChart | undefined;
    itemsMap: ItemsMap | undefined;
    resolvedTimezone: string | undefined;
}): AxisTimezoneConfig => {
    const detectedField = detectTimezoneShiftedField(params);
    if (detectedField) {
        return {
            timeAxisField: {
                fieldId: detectedField.fieldId,
                timezone: detectedField.timezone,
                flipAxes: detectedField.flipAxes,
            },
            axisTimezone: undefined,
            axisDisplayTimezone: detectedField.timezone,
        };
    }
    return {
        timeAxisField: undefined,
        axisTimezone: params.resolvedTimezone,
        axisDisplayTimezone: undefined,
    };
};

// Same shape the option walker consumes, but for a calendar value the 'UTC'
// target is a zero-offset transport anchor, not a timezone conversion — the
// DATE itself is never shifted.
export type CalendarTimeAxisField = TimezoneShiftedField;

// A calendar DATE (plain DATE column, DATE metric/table calc, or a
// day-or-coarser TIMESTAMP trunc, which compiles to a real DATE) carries no
// instant. ECharts parses a bare `YYYY-MM-DD` on a `time` axis as
// browser-LOCAL midnight, so with `useUTC: true` positive-offset browsers
// label it one day early. Encoding the plotted coordinate as UTC midnight
// keeps the calendar day fixed for every viewer.
//
// Gated on the response's resolvedTimezone: only flag-on results emit bare
// calendar values (flag-off keeps full ISO strings and must stay untouched).
// The timezone string is only the mode signal and is never applied to the
// DATE. physicalAxisType must come from the axis actually built for the
// field (xAxis[0], or yAxis[0] when flipped) so reference-line-forced time
// axes on coarse grains are covered and category axes are left alone.
export const detectCalendarTimeAxisField = ({
    validCartesianConfig,
    itemsMap,
    resolvedTimezone,
    physicalAxisType,
}: {
    validCartesianConfig: CartesianChart | undefined;
    itemsMap: ItemsMap | undefined;
    resolvedTimezone: string | undefined;
    physicalAxisType: string | undefined;
}): CalendarTimeAxisField | undefined => {
    if (!resolvedTimezone || physicalAxisType !== 'time') return undefined;
    if (!validCartesianConfig || !itemsMap) return undefined;
    // xField is the semantic dimension; flipAxes only moves it to physical Y.
    const fieldId = validCartesianConfig.layout?.xField;
    if (!fieldId) return undefined;
    const field = itemsMap[fieldId];
    if (!field || !isCalendarValueItem(field)) return undefined;
    return {
        fieldId,
        timezone: 'UTC',
        flipAxes: !!validCartesianConfig.layout?.flipAxes,
    };
};

// The single descriptor for how the physical time axis plots its coordinates.
// undefined means no time axis or timezone support off — no rewrite at all.
export type TimeAxisMode =
    | {
          // Instant values rewritten to project-tz wall-clock; ref-line
          // instants get the same shift.
          kind: 'instant-shifted';
          fieldId: string;
          timezone: string;
          flipAxes: boolean;
      }
    | {
          // Calendar DATEs anchored to UTC midnight; the date itself is
          // never shifted.
          kind: 'calendar';
          fieldId: string;
          flipAxes: boolean;
      }
    | {
          // Time axis whose coordinates stay raw (e.g. UTC project);
          // ref lines still need the browser-independent parse.
          kind: 'plain';
          flipAxes: boolean;
          // When the raw coordinate is formatted into a timezone, authored
          // wall-clock values must map back to the corresponding raw instant.
          wallClockTimezone?: string;
      };

// physicalAxisType must come from the axis actually built for the field
// (xAxis[0], or yAxis[0] when flipped). Requiring `time` here is safe for the
// instant path too: shiftable instants are DATE/TIMESTAMP fields whose grains
// are excluded from the category-axis downgrade, so they always build a
// `time` axis.
export const detectTimeAxisMode = ({
    validCartesianConfig,
    itemsMap,
    resolvedTimezone,
    physicalAxisType,
    plainWallClockTimezone,
}: {
    validCartesianConfig: CartesianChart | undefined;
    itemsMap: ItemsMap | undefined;
    resolvedTimezone: string | undefined;
    physicalAxisType: string | undefined;
    plainWallClockTimezone?: string;
}): TimeAxisMode | undefined => {
    if (!resolvedTimezone || physicalAxisType !== 'time') return undefined;
    const flipAxes = !!validCartesianConfig?.layout?.flipAxes;
    const shifted = detectTimezoneShiftedField({
        validCartesianConfig,
        itemsMap,
        resolvedTimezone,
    });
    if (shifted) {
        return {
            kind: 'instant-shifted',
            fieldId: shifted.fieldId,
            timezone: shifted.timezone,
            flipAxes,
        };
    }
    const calendar = detectCalendarTimeAxisField({
        validCartesianConfig,
        itemsMap,
        resolvedTimezone,
        physicalAxisType,
    });
    if (calendar) {
        return {
            kind: 'calendar',
            fieldId: calendar.fieldId,
            flipAxes,
        };
    }
    return {
        kind: 'plain',
        flipAxes,
        wallClockTimezone: plainWallClockTimezone,
    };
};

const SHIFTED_DIM_SUFFIX = '_ld_tz_shifted';

type EchartsDimension = string | { name?: string; [key: string]: unknown };

type EchartsSeriesShape = {
    encode?: { x?: unknown; y?: unknown; [key: string]: unknown };
    dimensions?: EchartsDimension[];
    data?: unknown[];
    [key: string]: unknown;
};

type EchartsDataset = {
    source?: unknown[];
    [key: string]: unknown;
};

export type EchartsOptionsShape = {
    dataset?: EchartsDataset | EchartsDataset[];
    series?: EchartsSeriesShape[];
    [key: string]: unknown;
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

const getDimensionName = (dim: EchartsDimension): string | undefined =>
    typeof dim === 'string' ? dim : dim?.name;

const renameDimension = (
    dim: EchartsDimension,
    from: string,
    to: string,
): EchartsDimension => {
    if (typeof dim === 'string') return dim === from ? to : dim;
    return dim?.name === from ? { ...dim, name: to } : dim;
};

// Preserves the input's array-vs-single shape.
const mapDatasets = (
    dataset: EchartsDataset | EchartsDataset[] | undefined,
    fn: (ds: EchartsDataset) => EchartsDataset,
): EchartsDataset | EchartsDataset[] | undefined => {
    if (Array.isArray(dataset)) return dataset.map(fn);
    if (dataset) return fn(dataset);
    return dataset;
};

// Adds a shifted-wall-clock column alongside the original UTC column on every row.
const shiftDatasetSources = (
    dataset: EchartsOptionsShape['dataset'],
    shifted: TimezoneShiftedField,
    shiftedDim: string,
): EchartsOptionsShape['dataset'] =>
    mapDatasets(dataset, (ds) => {
        if (!Array.isArray(ds.source)) return ds;
        const newSource = ds.source.map((row) => {
            if (!isPlainObject(row)) return row;
            const shiftedMs = shiftRawToTimezoneWallClockMs(
                row[shifted.fieldId],
                shifted.timezone,
            );
            return {
                ...row,
                [shiftedDim]: shiftedMs ?? row[shifted.fieldId] ?? null,
            };
        });
        return { ...ds, source: newSource };
    });

// For series whose data points are tuples indexed by dimension order (e.g.
// stacked bars), overwrite the slot at the shifted dimension.
const shiftSeriesTupleData = (
    series: EchartsSeriesShape,
    shifted: TimezoneShiftedField,
    shiftedDim: string,
): EchartsSeriesShape => {
    if (!Array.isArray(series.data) || !series.dimensions) return series;
    const slotIdx = series.dimensions.map(getDimensionName).indexOf(shiftedDim);
    if (slotIdx < 0) return series;

    const newData = series.data.map((d) => {
        if (!isPlainObject(d) || !Array.isArray(d.value)) return d;
        const newValue = [...d.value];
        const shiftedMs = shiftRawToTimezoneWallClockMs(
            newValue[slotIdx],
            shifted.timezone,
        );
        if (shiftedMs !== undefined) newValue[slotIdx] = shiftedMs;
        return { ...d, value: newValue };
    });
    return { ...series, data: newData };
};

// Point series that were reading the original field at their encoded axis to
// the shifted column instead.
const renameSeriesEncoding = (
    series: EchartsSeriesShape[] | undefined,
    shifted: TimezoneShiftedField,
    shiftedDim: string,
): EchartsSeriesShape[] => {
    const which: 'x' | 'y' = shifted.flipAxes ? 'y' : 'x';
    return (series ?? []).map((s) => {
        if (s.encode?.[which] !== shifted.fieldId) return s;
        const renamed: EchartsSeriesShape = {
            ...s,
            encode: { ...s.encode, [which]: shiftedDim },
            dimensions: s.dimensions?.map((d) =>
                renameDimension(d, shifted.fieldId, shiftedDim),
            ),
        };
        return shiftSeriesTupleData(renamed, shifted, shiftedDim);
    });
};

// Some synthetic series (e.g. stack-total labels) carry bare-array data with
// no encode/dimensions, so the dimension-based shift above misses them. Shift
// their axis slot in place so the labels stay aligned with the shifted bars.
const shiftBareArraySeriesData = (
    series: EchartsSeriesShape[] | undefined,
    shifted: TimezoneShiftedField,
): EchartsSeriesShape[] => {
    if (!series) return [];
    const axisSlot = shifted.flipAxes ? 1 : 0;
    return series.map((s) => {
        if (!Array.isArray(s.data)) return s;
        let mutated = false;
        const newData = s.data.map((d) => {
            if (!Array.isArray(d)) return d;
            const shiftedMs = shiftRawToTimezoneWallClockMs(
                d[axisSlot],
                shifted.timezone,
            );
            if (shiftedMs === undefined) return d;
            mutated = true;
            const next = [...d];
            next[axisSlot] = shiftedMs;
            return next;
        });
        return mutated ? { ...s, data: newData } : s;
    });
};

// Run last on the built echarts options — the rest of the pipeline stays in
// UTC. Dataset and encode rewrite only; markLine values are handled by the
// separate normalizeMarkLineTimeValues pass.
export const applyTimezoneShiftToEchartsOptions = <
    O extends EchartsOptionsShape,
>(
    options: O,
    shifted: TimezoneShiftedField,
): O => {
    const shiftedDim = `${shifted.fieldId}${SHIFTED_DIM_SUFFIX}`;
    const renamedSeries = renameSeriesEncoding(
        options.series,
        shifted,
        shiftedDim,
    );
    return {
        ...options,
        dataset: shiftDatasetSources(options.dataset, shifted, shiftedDim),
        series: shiftBareArraySeriesData(renamedSeries, shifted),
    };
};

// A reference line's stored value aimed at the time axis is one of exactly two
// things. A number, Date, or datetime string with an explicit zone
// (parseTimestampValueUTC hasZone) is an instant: parsed, then given the same
// transform as the data points (wall-clock shift on shifted axes, identity
// otherwise). An offset-less string — a datetime without a zone, or a
// calendar value in the canonical picker formats (parseCalendarValueUTC) — is
// a wall-clock position on the axis as the viewer sees it: parsed naive as
// UTC, plotted directly, no offset. Both reads are browser-independent by
// construction. Other inputs are left untouched rather than leniently
// coerced. Axis ownership is resolved earlier while field identity is still
// available; this pass never infers it from the value's shape.
export type MarkLineTimeNormalization = {
    flipAxes: boolean;
    // Zone the axis's plotted coordinates are wall-clock-shifted to; undefined
    // means instants plot at their raw epoch (unshifted or UTC-anchored axis).
    instantTimezone: string | undefined;
    wallClockTimezone?: string;
};

const parseTimeAxisMarkLineValue = (
    raw: unknown,
    {
        instantTimezone,
        wallClockTimezone,
    }: Pick<MarkLineTimeNormalization, 'instantTimezone' | 'wallClockTimezone'>,
): number | undefined => {
    const toShiftedInstant = (ms: number): number | undefined =>
        Number.isFinite(ms)
            ? ms +
              (instantTimezone ? getTimezoneOffsetMs(ms, instantTimezone) : 0)
            : undefined;
    const toRawWallClockCoordinate = (ms: number): number =>
        wallClockTimezone
            ? dayjs.utc(ms).tz(wallClockTimezone, true).valueOf()
            : ms;
    if (typeof raw === 'number') return toShiftedInstant(raw);
    if (raw instanceof Date) return toShiftedInstant(raw.getTime());
    if (typeof raw !== 'string') return undefined;
    const value = raw.trim();
    const timestamp = parseTimestampValueUTC(value);
    if (timestamp) {
        const ms = timestamp.date.getTime();
        return timestamp.hasZone
            ? toShiftedInstant(ms)
            : toRawWallClockCoordinate(ms);
    }
    const calendarMs = parseCalendarValueUTC(value)?.getTime();
    return calendarMs === undefined
        ? undefined
        : toRawWallClockCoordinate(calendarMs);
};

// After numericizing, default labels would echo the epoch ms: ECharts' own
// default label formatter echoes the value, and the reference-line style
// formatter renders `name || value`. Keep the author's text by naming
// unnamed entries and providing a plain formatter where none exists.
const authoredLabelProps = (
    entry: Record<string, unknown>,
    text: string,
): Record<string, unknown> => {
    const props: Record<string, unknown> = {};
    const hasAuthoredName =
        typeof entry.name === 'string' && entry.name.trim() !== '';
    if (!hasAuthoredName) {
        props.name = text;
    }
    const label = isPlainObject(entry.label) ? entry.label : undefined;
    if (label?.formatter === undefined) {
        props.label = {
            ...label,
            formatter: hasAuthoredName ? entry.name : text,
        };
    }
    return props;
};

// Runs on the final options for every physical time axis when timezone
// support is on (shifted or not): reference lines carry user-authored strings
// that ECharts would otherwise parse browser-locally. Series-relative marks
// (type 'average' etc.) carry no axis position and are skipped, including any
// stale slot values on them.
export const normalizeMarkLineTimeValues = <O extends EchartsOptionsShape>(
    options: O,
    normalization: MarkLineTimeNormalization,
): O => {
    if (!options.series) return options;
    const timeSlot = normalization.flipAxes ? 'yAxis' : 'xAxis';
    const series = options.series.map((s) => {
        const markLine = s.markLine;
        if (!isPlainObject(markLine) || !Array.isArray(markLine.data)) {
            return s;
        }
        let mutated = false;
        const newData = markLine.data.map((entry) => {
            if (!isPlainObject(entry) || entry.type !== undefined) return entry;
            const raw = entry[timeSlot];
            if (raw === undefined || raw === null) return entry;
            const ms = parseTimeAxisMarkLineValue(raw, normalization);
            if (ms === undefined) return entry;
            mutated = true;
            return {
                ...entry,
                ...(typeof raw === 'string'
                    ? authoredLabelProps(entry, raw.trim())
                    : {}),
                [timeSlot]: ms,
            };
        });
        return mutated ? { ...s, markLine: { ...markLine, data: newData } } : s;
    });
    return { ...options, series };
};

// The one entry point the chart hook calls on its built options: applies the
// coordinate rewrite the mode calls for, then the ref-line normalization
// every time axis needs. No mode, no rewrite — flag-off options pass through
// untouched.
export const finalizeTimeAxisOptions = <O extends EchartsOptionsShape>(
    options: O,
    mode: TimeAxisMode | undefined,
): O => {
    if (!mode) return options;
    switch (mode.kind) {
        case 'instant-shifted': {
            const shifted = applyTimezoneShiftToEchartsOptions(options, {
                fieldId: mode.fieldId,
                timezone: mode.timezone,
                flipAxes: mode.flipAxes,
            });
            return normalizeMarkLineTimeValues(shifted, {
                flipAxes: mode.flipAxes,
                instantTimezone: mode.timezone,
            });
        }
        case 'calendar': {
            // The 'UTC' target is a zero-offset transport anchor encoding the
            // calendar day as UTC midnight, not a timezone conversion.
            const anchored = applyTimezoneShiftToEchartsOptions(options, {
                fieldId: mode.fieldId,
                timezone: 'UTC',
                flipAxes: mode.flipAxes,
            });
            return normalizeMarkLineTimeValues(anchored, {
                flipAxes: mode.flipAxes,
                instantTimezone: undefined,
            });
        }
        case 'plain':
            return normalizeMarkLineTimeValues(options, {
                flipAxes: mode.flipAxes,
                instantTimezone: undefined,
                wallClockTimezone: mode.wallClockTimezone,
            });
        default:
            return assertUnreachable(mode, 'Unknown time axis mode');
    }
};
