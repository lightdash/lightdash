import {
    isDimension,
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

// When shifted, axisTimezone is undefined and axisDisplayTimezone holds the tz.
// Otherwise the swap is reversed. Callers shouldn't compute this themselves.
export type AxisTimezoneConfig = {
    shiftedField: TimezoneShiftedField | undefined;
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
}): TimezoneShiftedField | undefined => {
    if (
        !resolvedTimezone ||
        resolvedTimezone === 'UTC' ||
        !validCartesianConfig ||
        !itemsMap
    ) {
        return undefined;
    }
    const flipAxes = !!validCartesianConfig.layout?.flipAxes;
    const timeFieldId = flipAxes
        ? validCartesianConfig.layout?.yField?.[0]
        : validCartesianConfig.layout?.xField;
    if (!timeFieldId) return undefined;
    const field = itemsMap[timeFieldId];
    if (!field || !isDimension(field)) return undefined;
    const timeInterval = field.timeInterval;
    if (!timeInterval) return undefined;
    if (TIME_INTERVALS_FOR_CATEGORY_AXIS.includes(timeInterval)) {
        return undefined;
    }
    return { fieldId: timeFieldId, timezone: resolvedTimezone, flipAxes };
};

export const resolveAxisTimezone = (params: {
    validCartesianConfig: CartesianChart | undefined;
    itemsMap: ItemsMap | undefined;
    resolvedTimezone: string | undefined;
}): AxisTimezoneConfig => {
    const shiftedField = detectTimezoneShiftedField(params);
    if (shiftedField) {
        return {
            shiftedField,
            axisTimezone: undefined,
            axisDisplayTimezone: shiftedField.timezone,
        };
    }
    return {
        shiftedField: undefined,
        axisTimezone: params.resolvedTimezone,
        axisDisplayTimezone: undefined,
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

// Appends a `<fieldId>__shifted` column to every source row.
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

// Tuple-mode (e.g. stacked bars) data points carry a value array indexed by
// dimension order; overwrite the slot at the shifted dim.
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

// Repoints series encoded on `fieldId` to the shifted dim.
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

// Some synthetic series (e.g. stack-total label series) use bare-array tuples
// as `series.data` with no encode/dimensions, so the regular shift paths miss
// them. They live on the same axis as the shifted bars, so shift the axis slot
// (index 0, or 1 when flipAxes) in-place to keep labels aligned with bars.
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

// Terminal post-processor; rest of the cartesian pipeline stays in true UTC.
// Generic preserves the caller's inferred option type for downstream destructuring.
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
