import { getInstanceByDom } from 'echarts';

// The only file that reads ECharts and zrender internals: what a chart drew
// under a point. Everything it returns is plain data.

export type ChartRect = { x: number; y: number; width: number; height: number };

/** What a chart drew under a point; rects are in chart pixels. */
export type ChartHit =
    | {
          kind: 'point';
          seriesType: string;
          seriesIndex: number;
          dataIndex: number;
          seriesName: string;
          name: string;
          value: unknown;
          encode: Record<string, number[]> | null;
          dimensionNames: string[] | null;
          /** The axis the categories run along; null off a grid. */
          baseAxis: 'x' | 'y' | null;
          /** True when that axis is a time axis: its values are timestamps. */
          baseAxisIsTime: boolean;
          rect: ChartRect;
      }
    | { kind: 'series'; seriesName: string; rect: ChartRect }
    | {
          kind: 'reference';
          seriesIndex: number;
          index: number;
          /** The text drawn on the line; empty when it has none. */
          text: string;
          rect: ChartRect;
      }
    | {
          kind: 'axis';
          axis: 'x' | 'y';
          index: number;
          name: string;
          rect: ChartRect;
      };

type ZrRect = ChartRect & {
    clone: () => ZrRect;
    applyTransform: (matrix: number[]) => void;
};
type ZrElement = {
    parent: ZrElement | null;
    __hostTarget: ZrElement | undefined;
    __legendDataIndex: number | undefined;
    transform: number[] | null;
    style: { text: unknown } | undefined;
    getBoundingRect: () => ZrRect;
    children: (() => ZrElement[]) | undefined;
    getTextContent: (() => ZrElement | null | undefined) | undefined;
    [key: string]: unknown;
};
type EcData = { seriesIndex: unknown; dataIndex: unknown; dataModel: unknown };
type SeriesData = {
    count: () => number;
    getItemLayout: (index: number) => unknown;
    getLayout: (key: string) => unknown;
};
type SeriesModel = {
    subType: string;
    name: string;
    getData: () => SeriesData;
    getDataParams: (index: number) => {
        seriesName: string | undefined;
        name: string | undefined;
        value: unknown;
        encode: Record<string, number[]> | undefined;
        dimensionNames: string[] | undefined;
    };
    getBaseAxis:
        | (() => { dim: string; type: string } | null | undefined)
        | undefined;
};
type AxisModel = {
    componentIndex: number;
    get: (path: string) => unknown;
    axis:
        | { position: string; grid: { getRect: () => ChartRect } | undefined }
        | undefined;
};
type Instance = {
    getZr: () => {
        handler: {
            findHover: (x: number, y: number) => { target: ZrElement | null };
        };
    };
    getModel: () => {
        getSeriesByIndex: (index: number) => SeriesModel | undefined;
        getSeries: () => SeriesModel[];
        queryComponents: (query: { mainType: string }) => AxisModel[];
    };
    getViewOfComponentModel: (model: AxisModel) =>
        | {
              group: ZrElement;
          }
        | undefined;
    containPixel: (finder: string, point: number[]) => boolean;
};

// Series whose parts are worth naming one by one.
const POINT_SERIES = new Set(['bar', 'line', 'scatter', 'pie', 'funnel']);
// Series drawn as points that the pointer snaps to.
const SNAP_SERIES = new Set(['line', 'scatter']);
const SNAP_RADIUS = 16;
const SNAP_MAX_POINTS = 5000;
const POINT_SIZE = 14;
const MIN_AXIS_BAND = 6;

// ECharts keeps each element's data under a key it numbers at load time.
let ecDataKey: string | null = null;

const ecDataOf = (element: ZrElement): EcData | null => {
    if (ecDataKey) return (element[ecDataKey] as EcData | undefined) ?? null;
    for (const key of Object.keys(element)) {
        if (!key.startsWith('__ec_inner_')) continue;
        const value = element[key];
        if (
            value &&
            typeof value === 'object' &&
            typeof (value as EcData).seriesIndex === 'number'
        ) {
            ecDataKey = key;
            return value as EcData;
        }
    }
    return null;
};

const rectOf = (element: ZrElement): ChartRect => {
    const rect = element.getBoundingRect().clone();
    if (element.transform) rect.applyTransform(element.transform);
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
};

const squareAt = (x: number, y: number): ChartRect => ({
    x: x - POINT_SIZE / 2,
    y: y - POINT_SIZE / 2,
    width: POINT_SIZE,
    height: POINT_SIZE,
});

const pointHit = (
    series: SeriesModel,
    seriesIndex: number,
    dataIndex: number,
    rect: ChartRect,
): ChartHit => {
    const params = series.getDataParams(dataIndex);
    const axis = series.getBaseAxis?.();
    const baseAxis = axis?.dim;
    return {
        kind: 'point',
        seriesType: series.subType,
        seriesIndex,
        dataIndex,
        seriesName: params.seriesName ?? series.name ?? '',
        name: params.name ?? '',
        value: params.value,
        encode: params.encode ?? null,
        dimensionNames: params.dimensionNames ?? null,
        baseAxis: baseAxis === 'x' || baseAxis === 'y' ? baseAxis : null,
        baseAxisIsTime: axis?.type === 'time',
        rect,
    };
};

// The drawn point of a series closest to a chart pixel.
const nearestPoint = (
    series: SeriesModel,
    x: number,
    y: number,
): { dataIndex: number; x: number; y: number; distance: number } | null => {
    const data = series.getData();
    const count = data.count();
    if (count > SNAP_MAX_POINTS) return null;
    // A line keeps every point in one flat list; a scatter keeps one each.
    const flat = data.getLayout('points');
    const points = ArrayBuffer.isView(flat)
        ? (flat as unknown as ArrayLike<number>)
        : null;
    let best: ReturnType<typeof nearestPoint> = null;
    for (let index = 0; index < count; index++) {
        const layout: unknown = points ? null : data.getItemLayout(index);
        const own = Array.isArray(layout) ? (layout as unknown[]) : null;
        if (!points && !own) continue;
        const px = Number(points ? points[index * 2] : own?.[0]);
        const py = Number(points ? points[index * 2 + 1] : own?.[1]);
        if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
        const distance = Math.hypot(px - x, py - y);
        if (!best || distance < best.distance) {
            best = { dataIndex: index, x: px, y: py, distance };
        }
    }
    return best;
};

const legendHit = (element: ZrElement): ChartHit | null => {
    const texts = (element.children?.() ?? []).flatMap((child) =>
        typeof child.style?.text === 'string' ? [child.style.text] : [],
    );
    if (texts.length === 0 || texts[0] === '') return null;
    return { kind: 'series', seriesName: texts[0], rect: rectOf(element) };
};

// A reference line: a marker a series draws, with the text on it.
const referenceHit = (
    element: ZrElement,
    seriesIndex: number,
    index: number,
): ChartHit => {
    const texts = (element.children?.() ?? []).flatMap((child) => {
        const text = child.getTextContent?.()?.style?.text;
        return typeof text === 'string' && text !== '' ? [text] : [];
    });
    return {
        kind: 'reference',
        seriesIndex,
        index,
        text: texts[0] ?? '',
        rect: rectOf(element),
    };
};

// An element under the pointer, or one that holds it, that names data.
const elementHit = (
    instance: Instance,
    target: ZrElement,
    x: number,
    y: number,
): ChartHit | null => {
    let element: ZrElement | null | undefined = target;
    for (let depth = 0; element && depth < 8; depth++) {
        if (typeof element.__legendDataIndex === 'number') {
            return legendHit(element);
        }
        const data = ecDataOf(element);
        if (data && typeof data.seriesIndex === 'number') {
            const series = instance
                .getModel()
                .getSeriesByIndex(data.seriesIndex);
            if (!series || !POINT_SERIES.has(series.subType)) return null;
            // A marker keeps its own data: its index is not a data point's.
            if (data.dataModel) {
                return typeof data.dataIndex === 'number'
                    ? referenceHit(element, data.seriesIndex, data.dataIndex)
                    : null;
            }
            if (typeof data.dataIndex === 'number') {
                return pointHit(
                    series,
                    data.seriesIndex,
                    data.dataIndex,
                    rectOf(element),
                );
            }
            // The body of a line or area: go to its closest point.
            const nearest = nearestPoint(series, x, y);
            return nearest
                ? pointHit(
                      series,
                      data.seriesIndex,
                      nearest.dataIndex,
                      squareAt(nearest.x, nearest.y),
                  )
                : null;
        }
        element = element.parent ?? element.__hostTarget;
    }
    return null;
};

// Near a line or scatter point without touching it.
const snapHit = (instance: Instance, x: number, y: number): ChartHit | null => {
    const allSeries = instance.getModel().getSeries();
    let best: {
        series: SeriesModel;
        seriesIndex: number;
        point: NonNullable<ReturnType<typeof nearestPoint>>;
    } | null = null;
    for (let index = 0; index < allSeries.length; index++) {
        const series = allSeries[index];
        if (!SNAP_SERIES.has(series.subType)) continue;
        const point = nearestPoint(series, x, y);
        if (!point || point.distance > SNAP_RADIUS) continue;
        if (!best || point.distance < best.point.distance) {
            best = { series, seriesIndex: index, point };
        }
    }
    return best
        ? pointHit(
              best.series,
              best.seriesIndex,
              best.point.dataIndex,
              squareAt(best.point.x, best.point.y),
          )
        : null;
};

// The strip an axis draws its labels and name in, outside its grid.
const axisBand = (all: ChartRect, grid: ChartRect, position: string) => {
    switch (position) {
        case 'bottom':
            return {
                x: grid.x,
                y: grid.y + grid.height,
                width: grid.width,
                height: all.y + all.height - (grid.y + grid.height),
            };
        case 'top':
            return {
                x: grid.x,
                y: all.y,
                width: grid.width,
                height: grid.y - all.y,
            };
        case 'left':
            return {
                x: all.x,
                y: grid.y,
                width: grid.x - all.x,
                height: grid.height,
            };
        case 'right':
            return {
                x: grid.x + grid.width,
                y: grid.y,
                width: all.x + all.width - (grid.x + grid.width),
                height: grid.height,
            };
        default:
            return null;
    }
};

const axisHit = (instance: Instance, x: number, y: number): ChartHit | null => {
    for (const dim of ['x', 'y'] as const) {
        const models = instance
            .getModel()
            .queryComponents({ mainType: `${dim}Axis` });
        for (const model of models) {
            const grid = model?.axis?.grid?.getRect();
            const view = model ? instance.getViewOfComponentModel(model) : null;
            if (!model?.axis || !grid || !view || model.get('show') === false) {
                continue;
            }
            const band = axisBand(
                view.group.getBoundingRect(),
                grid,
                model.axis.position,
            );
            if (!band) continue;
            if (band.width < MIN_AXIS_BAND || band.height < MIN_AXIS_BAND) {
                continue;
            }
            if (
                x >= band.x &&
                x <= band.x + band.width &&
                y >= band.y &&
                y <= band.y + band.height
            ) {
                const name = model.get('name');
                return {
                    kind: 'axis',
                    axis: dim,
                    index: model.componentIndex,
                    name: typeof name === 'string' ? name : '',
                    rect: band,
                };
            }
        }
    }
    return null;
};

/** What the chart drawn in an element shows at a pixel of that element; null for nothing nameable. */
export const chartHitAt = (
    chartElement: HTMLElement,
    x: number,
    y: number,
): ChartHit | null => {
    const instance = getInstanceByDom(chartElement) as unknown as
        | Instance
        | undefined;
    if (!instance) return null;
    try {
        const { target } = instance.getZr().handler.findHover(x, y);
        if (target) {
            const hit = elementHit(instance, target, x, y);
            if (hit) return hit;
        }
        if (instance.containPixel('grid', [x, y])) {
            return snapHit(instance, x, y);
        }
        return axisHit(instance, x, y);
    } catch {
        // Internals moved: the pick falls back to the whole tile.
        return null;
    }
};
