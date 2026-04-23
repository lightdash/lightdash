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
};

const getTimezoneOffsetMs = (ms: number, timezone: string): number =>
    dayjs(ms).tz(timezone).utcOffset() * 60_000;

const shiftRawToTimezoneWallClockMs = (
    raw: unknown,
    timezone: string,
): number | undefined => {
    if (raw === null || raw === undefined) return undefined;
    const ms = typeof raw === 'number' ? raw : new Date(String(raw)).getTime();
    if (!Number.isFinite(ms)) return undefined;
    return ms + getTimezoneOffsetMs(ms, timezone);
};

export const detectTimezoneShiftedField = ({
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
    if (!field || !isDimension(field) || !field.timeInterval) {
        return undefined;
    }
    if (
        TIME_INTERVALS_FOR_CATEGORY_AXIS.includes(
            field.timeInterval as TimeFrames,
        )
    ) {
        return undefined;
    }
    return { fieldId: timeFieldId, timezone: resolvedTimezone };
};

const SHIFTED_DIM_SUFFIX = '__shifted';

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

type EchartsOptionsShape = {
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

// Terminal post-processor; keeps the rest of the cartesian pipeline in true UTC.
export const applyTimezoneShiftToEchartsOptions = <
    O extends EchartsOptionsShape,
>(
    options: O,
    shifted: TimezoneShiftedField,
    flipAxes: boolean,
): O => {
    const { fieldId, timezone } = shifted;
    const shiftedDim = `${fieldId}${SHIFTED_DIM_SUFFIX}`;

    const datasetWasArray = Array.isArray(options.dataset);
    let datasets: EchartsDataset[] = [];
    if (Array.isArray(options.dataset)) datasets = options.dataset;
    else if (options.dataset) datasets = [options.dataset];

    const newDatasets: EchartsDataset[] = datasets.map((ds) => {
        if (!Array.isArray(ds.source)) return ds;
        const newSource = ds.source.map((row) => {
            if (!isPlainObject(row)) return row;
            const shiftedMs = shiftRawToTimezoneWallClockMs(
                row[fieldId],
                timezone,
            );
            return {
                ...row,
                [shiftedDim]: shiftedMs ?? row[fieldId] ?? null,
            };
        });
        return { ...ds, source: newSource };
    });

    const which: 'x' | 'y' = flipAxes ? 'y' : 'x';
    const seriesList = options.series ?? [];

    const newSeries: EchartsSeriesShape[] = seriesList.map((s) => {
        if (s.encode?.[which] !== fieldId) return s;

        const newEncode = { ...s.encode, [which]: shiftedDim };
        const newDimensions = s.dimensions?.map((d) =>
            renameDimension(d, fieldId, shiftedDim),
        );

        let newData = s.data;
        if (Array.isArray(s.data) && newDimensions) {
            const slotIdx = newDimensions
                .map(getDimensionName)
                .indexOf(shiftedDim);
            if (slotIdx >= 0) {
                newData = s.data.map((d) => {
                    if (!isPlainObject(d) || !Array.isArray(d.value)) return d;
                    const newValue = [...d.value];
                    const shiftedMs = shiftRawToTimezoneWallClockMs(
                        newValue[slotIdx],
                        timezone,
                    );
                    if (shiftedMs !== undefined) newValue[slotIdx] = shiftedMs;
                    return { ...d, value: newValue };
                });
            }
        }

        return {
            ...s,
            encode: newEncode,
            dimensions: newDimensions,
            data: newData,
        };
    });

    return {
        ...options,
        dataset: datasetWasArray ? newDatasets : newDatasets[0],
        series: newSeries,
    };
};
