import {
    CartesianSeriesType,
    isCalendarValueItem,
    isDimension,
    TimeFrames,
    type Dimension,
    type EChartsImagePattern,
    type EChartsSeries,
    type ItemsMap,
} from '@lightdash/common';
import dayjs, { type ManipulateType } from 'dayjs';
import timezonePlugin from 'dayjs/plugin/timezone';
import utcPlugin from 'dayjs/plugin/utc';

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);

const PERIOD_LENGTH: Partial<
    Record<TimeFrames, { amount: number; unit: ManipulateType }>
> = {
    [TimeFrames.YEAR]: { amount: 1, unit: 'year' },
    [TimeFrames.QUARTER]: { amount: 3, unit: 'month' },
    [TimeFrames.MONTH]: { amount: 1, unit: 'month' },
    [TimeFrames.WEEK]: { amount: 7, unit: 'day' },
    [TimeFrames.DAY]: { amount: 1, unit: 'day' },
    [TimeFrames.HOUR]: { amount: 1, unit: 'hour' },
    [TimeFrames.MINUTE]: { amount: 1, unit: 'minute' },
};

const INCOMPLETE_SUFFIX = '__incomplete_period';
const COMPLETE_SUFFIX = '__complete_period';
const OVERLAY_ID_PREFIX = 'incomplete-period-';

type ColorCallbackParams = {
    dataIndex: number;
    name: string;
    data: Record<string, unknown>;
};

type TooltipParam = { dimensionNames?: string[] };

/** Whether the field is a truncated date dimension (week, month...) whose latest period can be unfinished. */
export const isIncompletePeriodEligible = (
    field: ItemsMap[string] | undefined,
): boolean =>
    !!field &&
    isDimension(field) &&
    !!field.timeInterval &&
    PERIOD_LENGTH[field.timeInterval] !== undefined;

const CALENDAR_DATE_FORMAT = 'YYYY-MM-DD';

const isTemporalRawValue = (value: unknown): value is Date | string | number =>
    value instanceof Date ||
    typeof value === 'string' ||
    typeof value === 'number';

/**
 * The rows whose period contains `now`: the rows an "in the current <grain>"
 * filter on the x field keeps. Each x value is the warehouse's own period
 * start (so week starts already follow the project's start of week); only
 * "now" needs placing. Day-or-coarser grains are calendar dates, and the
 * filter compiler reads today in the query timezone when timezone support is
 * on (the results' resolved timezone) and in UTC otherwise. Sub-day grains
 * are instants, compared directly.
 */
export const getIncompletePeriodRowIndexes = ({
    rows,
    xKey,
    field,
    timezone,
    now,
}: {
    rows: Record<string, unknown>[];
    xKey: string;
    field: Dimension;
    timezone: string | undefined;
    now: Date;
}): Set<number> => {
    const period = field.timeInterval
        ? PERIOD_LENGTH[field.timeInterval]
        : undefined;
    const indexes = new Set<number>();
    if (!period) return indexes;
    const isCalendar = isCalendarValueItem(field);
    const today = dayjs(now)
        .tz(timezone ?? 'UTC')
        .format(CALENDAR_DATE_FORMAT);
    rows.forEach((row, index) => {
        const value = row[xKey];
        if (!isTemporalRawValue(value)) return;
        const start = dayjs.utc(value);
        if (!start.isValid()) return;
        const end = start.add(period.amount, period.unit);
        const isCurrent = isCalendar
            ? start.format(CALENDAR_DATE_FORMAT) <= today &&
              today < end.format(CALENDAR_DATE_FORMAT)
            : start.valueOf() <= now.getTime() && now.getTime() < end.valueOf();
        if (isCurrent) indexes.add(index);
    });
    return indexes;
};

// Fallback hex of a `var(--name, #hex)` color; the pattern image cannot read CSS variables
const toPatternColor = (color: string) =>
    /^var\(.*,\s*(#[0-9a-fA-F]{3,8})\s*\)$/.exec(color)?.[1] ?? color;

export const getHatchPattern = (color: string): EChartsImagePattern => {
    const fill = toPatternColor(color);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="6" height="6"><rect width="6" height="6" fill="${fill}" fill-opacity="0.3"/><path d="M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2" stroke="${fill}" stroke-width="1.5"/></svg>`;
    return {
        image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
        imageWidth: 6,
        imageHeight: 6,
        repeat: 'repeat',
    };
};

const isLineLike = (series: EChartsSeries) =>
    series.type === CartesianSeriesType.LINE ||
    series.type === CartesianSeriesType.AREA;

// ECharts only reads the dataset columns a series lists in its dimensions
const renameDimension = (
    series: EChartsSeries,
    from: string,
    to: string,
): EChartsSeries['dimensions'] =>
    series.dimensions?.map((dimension) =>
        dimension.name === from ? { ...dimension, name: to } : dimension,
    );

const hatchBars = (
    series: EChartsSeries,
    incompleteIndexes: Set<number>,
): EChartsSeries => {
    const baseColor = series.itemStyle?.color ?? series.color;
    if (!baseColor) return series;
    const data = Array.isArray(series.data)
        ? series.data.map((item, index) => {
              if (
                  !incompleteIndexes.has(index) ||
                  item === null ||
                  typeof item !== 'object' ||
                  !('itemStyle' in item)
              ) {
                  return item;
              }
              const { itemStyle } = item as {
                  itemStyle?: { color?: unknown };
              };
              return typeof itemStyle?.color === 'string'
                  ? {
                        ...item,
                        itemStyle: {
                            ...itemStyle,
                            color: getHatchPattern(itemStyle.color),
                        },
                    }
                  : item;
          })
        : series.data;
    return {
        ...series,
        data,
        itemStyle: {
            ...series.itemStyle,
            color: (params: ColorCallbackParams) => {
                const color =
                    typeof baseColor === 'function'
                        ? baseColor(params)
                        : baseColor;
                return incompleteIndexes.has(params.dataIndex) &&
                    typeof color === 'string'
                    ? getHatchPattern(color)
                    : color;
            },
        },
    };
};

/**
 * Styles the current, unfinished time period: hatched bars, and for unstacked
 * lines a dashed segment into a hollow point. A line's own last segment moves
 * to a silent overlay series that reads extra dataset columns, so the
 * original series keeps its tooltip and legend entry.
 */
export const applyIncompletePeriodStyle = <T extends { formatter?: unknown }>({
    series,
    rows,
    tooltip,
    xFieldId,
    flipAxes,
    itemsMap,
    timezone,
    now,
}: {
    series: EChartsSeries[];
    rows: Record<string, unknown>[];
    tooltip: T;
    xFieldId: string | undefined;
    flipAxes: boolean;
    itemsMap: ItemsMap;
    /** The results' resolved timezone: set only when timezone support is on */
    timezone: string | undefined;
    now: Date;
}): {
    series: EChartsSeries[];
    rows: Record<string, unknown>[];
    tooltip: T;
} => {
    const xField = xFieldId ? itemsMap[xFieldId] : undefined;
    const categoryAxis = flipAxes ? 'y' : 'x';
    const valueAxis = flipAxes ? 'x' : 'y';
    const xKey = series.find((s) => s.encode)?.encode?.[categoryAxis];
    if (!isIncompletePeriodEligible(xField) || !isDimension(xField) || !xKey) {
        return { series, rows, tooltip };
    }
    const incompleteIndexes = getIncompletePeriodRowIndexes({
        rows,
        xKey,
        field: xField,
        timezone,
        now,
    });
    if (incompleteIndexes.size === 0) return { series, rows, tooltip };

    const neighbourIndexes = new Set<number>();
    incompleteIndexes.forEach((index) => {
        [index - 1, index + 1].forEach((neighbour) => {
            if (
                neighbour >= 0 &&
                neighbour < rows.length &&
                !incompleteIndexes.has(neighbour)
            ) {
                neighbourIndexes.add(neighbour);
            }
        });
    });

    const splitKeys = new Map<string, string>();
    const overlays: EChartsSeries[] = [];
    const styledSeries = series.map<EChartsSeries>((serie, seriesIndex) => {
        if (serie.type === CartesianSeriesType.BAR) {
            return hatchBars(serie, incompleteIndexes);
        }
        const valueKey = serie.encode?.[valueAxis];
        if (!isLineLike(serie) || serie.stack || !serie.encode || !valueKey) {
            return serie;
        }
        const completeKey = `${valueKey}${COMPLETE_SUFFIX}`;
        const incompleteKey = `${valueKey}${INCOMPLETE_SUFFIX}`;
        splitKeys.set(completeKey, valueKey);
        const { markLine, ...overlayBase } = serie;
        overlays.push({
            ...overlayBase,
            id: `${OVERLAY_ID_PREFIX}${seriesIndex}`,
            encode: { ...serie.encode, [valueAxis]: incompleteKey },
            dimensions: renameDimension(serie, valueKey, incompleteKey),
            connectNulls: false,
            showSymbol: true,
            symbol: 'emptyCircle',
            symbolSize: (_value: unknown, params: { dataIndex: number }) =>
                incompleteIndexes.has(params.dataIndex) ? 7 : 0,
            silent: true,
            tooltip: { show: false },
            lineStyle: { ...serie.lineStyle, type: 'dashed' },
            areaStyle: serie.areaStyle
                ? { ...serie.areaStyle, opacity: 0.1 }
                : undefined,
            label: serie.label?.show
                ? {
                      ...serie.label,
                      formatter: (param: {
                          data: Record<string, unknown>;
                          dataIndex?: number;
                      }) =>
                          param.dataIndex !== undefined &&
                          incompleteIndexes.has(param.dataIndex)
                              ? (serie.label?.formatter?.(param) ?? '')
                              : '',
                  }
                : undefined,
            z: (serie.z ?? 0) + 1,
        });
        return {
            ...serie,
            encode: { ...serie.encode, [valueAxis]: completeKey },
            dimensions: renameDimension(serie, valueKey, completeKey),
        };
    });
    if (splitKeys.size === 0) {
        return { series: styledSeries, rows, tooltip };
    }

    const styledRows = rows.map((row, index) => {
        const extra: Record<string, unknown> = {};
        splitKeys.forEach((valueKey, completeKey) => {
            const value = row[valueKey];
            extra[completeKey] = incompleteIndexes.has(index) ? null : value;
            extra[`${valueKey}${INCOMPLETE_SUFFIX}`] =
                incompleteIndexes.has(index) || neighbourIndexes.has(index)
                    ? value
                    : null;
        });
        return { ...row, ...extra };
    });

    // Tooltips read the original column, not the split one the line draws from
    const { formatter } = tooltip;
    const styledTooltip =
        typeof formatter === 'function'
            ? {
                  ...tooltip,
                  formatter: (params: TooltipParam | TooltipParam[]) => {
                      const restore = (param: TooltipParam) => ({
                          ...param,
                          dimensionNames: param.dimensionNames?.map(
                              (name) => splitKeys.get(name) ?? name,
                          ),
                      });
                      return formatter(
                          Array.isArray(params)
                              ? params.map(restore)
                              : restore(params),
                      );
                  },
              }
            : tooltip;

    return {
        series: [...styledSeries, ...overlays],
        rows: styledRows,
        tooltip: styledTooltip,
    };
};
