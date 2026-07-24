import {
    extractableTimeFrames,
    isCalendarValueItem,
    isDimension,
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

// Reference lines carry raw axis values that ECharts would parse differently
// from the rewritten data coordinates, leaving the line offset from its bars.
// Run the time-axis slot (xAxis, or yAxis when flipped) through the same
// transform. Value-axis slots and series-relative marks (type 'average' etc.,
// which carry no axis value) are untouched.
const shiftSeriesMarkLineValues = (
    series: EchartsSeriesShape[],
    shifted: TimezoneShiftedField,
): EchartsSeriesShape[] => {
    const axisKey = shifted.flipAxes ? 'yAxis' : 'xAxis';
    return series.map((s) => {
        const markLine = s.markLine;
        if (!isPlainObject(markLine) || !Array.isArray(markLine.data)) {
            return s;
        }
        let mutated = false;
        const newData = markLine.data.map((entry) => {
            if (!isPlainObject(entry)) return entry;
            const raw = entry[axisKey];
            if (raw === undefined || raw === null) return entry;
            const shiftedMs = shiftRawToTimezoneWallClockMs(
                raw,
                shifted.timezone,
            );
            if (shiftedMs === undefined) return entry;
            mutated = true;
            return { ...entry, [axisKey]: shiftedMs };
        });
        return mutated ? { ...s, markLine: { ...markLine, data: newData } } : s;
    });
};

// Run last on the built echarts options — the rest of the pipeline stays in UTC.
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
        series: shiftSeriesMarkLineValues(
            shiftBareArraySeriesData(renamedSeries, shifted),
            shifted,
        ),
    };
};
