import { assertUnreachable } from '@lightdash/common';
import { type CaptureTarget } from '../capture/types';
import { chartHitAt, type ChartHit } from './echartsHit';
import { clip, onTile, type PartTile } from './partLabel';

const CHART_SELECTOR = '[_echarts_instance_]';
const NAME_MAX = 32;
const SERIES_MAX = 28;

type PointHit = Extract<ChartHit, { kind: 'point' }>;

// The value a data point holds for one of its series' encoded roles.
const encoded = (hit: PointHit, role: string): unknown => {
    const index = hit.encode?.[role]?.[0];
    if (index === undefined) return undefined;
    if (Array.isArray(hit.value)) return hit.value[index];
    const dimension = hit.dimensionNames?.[index];
    if (dimension === undefined) return undefined;
    if (hit.value && typeof hit.value === 'object') {
        return (hit.value as Record<string, unknown>)[dimension];
    }
    return undefined;
};

const MIDNIGHT = /^(\d{4}-\d{2}-\d{2})T00:00:00(\.0+)?Z?$/;

// A raw value as text, close to how a chart writes it.
const formatValue = (value: unknown): string | null => {
    if (typeof value === 'number') {
        return Number.isFinite(value)
            ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
            : null;
    }
    if (typeof value === 'string') {
        if (value.trim() === '') return null;
        return value.replace(MIDNIGHT, '$1');
    }
    if (typeof value === 'boolean') return String(value);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return null;
};

const POINT_NOUN: Record<string, string> = {
    bar: 'bar',
    line: 'point',
    scatter: 'point',
    pie: 'slice',
    funnel: 'stage',
};

// The category a data point sits at and the amount it shows.
const readPoint = (
    hit: PointHit,
): { category: string | null; amount: string | null } => {
    if (hit.baseAxis) {
        const valueAxis = hit.baseAxis === 'x' ? 'y' : 'x';
        return {
            category:
                formatValue(encoded(hit, hit.baseAxis)) ??
                formatValue(hit.name),
            amount: formatValue(encoded(hit, valueAxis)),
        };
    }
    return {
        category:
            formatValue(hit.name) ?? formatValue(encoded(hit, 'itemName')),
        amount: formatValue(hit.value) ?? formatValue(encoded(hit, 'value')),
    };
};

/** A chart hit as a target that names what is on screen and the tile it is on. */
export const chartTarget = (hit: ChartHit, tile: PartTile): CaptureTarget => {
    switch (hit.kind) {
        case 'point': {
            const { category, amount } = readPoint(hit);
            const noun = POINT_NOUN[hit.seriesType] ?? 'point';
            const phrase = [
                noun,
                category ? `"${clip(category, NAME_MAX)}"` : null,
                // A pie's one series is the chart itself.
                hit.seriesName && hit.seriesName !== category && hit.baseAxis
                    ? `in series "${clip(hit.seriesName, SERIES_MAX)}"`
                    : null,
                amount ? `(${clip(amount, 20)})` : null,
            ]
                .filter((part) => part !== null)
                .join(' ');
            return {
                kind: 'chart-point',
                id: `${tile.uuid}/point/${hit.seriesIndex}/${hit.dataIndex}`,
                label: onTile(phrase, tile.title),
                parentId: tile.uuid,
            };
        }
        case 'series':
            return {
                kind: 'chart-series',
                id: `${tile.uuid}/series/${hit.seriesName}`,
                label: onTile(
                    `series "${clip(hit.seriesName, NAME_MAX)}"`,
                    tile.title,
                ),
                parentId: tile.uuid,
            };
        case 'axis':
            return {
                kind: 'chart-axis',
                id: `${tile.uuid}/axis/${hit.axis}${hit.index}`,
                label: onTile(
                    hit.name
                        ? `${hit.axis} axis "${clip(hit.name, NAME_MAX)}"`
                        : `${hit.axis} axis`,
                    tile.title,
                ),
                parentId: tile.uuid,
            };
        default:
            return assertUnreachable(hit, 'Unknown chart hit');
    }
};

/** Cursor on a chart: the bar, point, slice, legend entry or axis under a viewport point. */
export const pickChartAt = (
    hit: Element,
    point: { x: number; y: number },
    tile: PartTile,
    hitAt: typeof chartHitAt = chartHitAt,
): { target: CaptureTarget; rect: DOMRect } | null => {
    const chartElement = hit.closest<HTMLElement>(CHART_SELECTOR);
    if (!chartElement) return null;
    const origin = chartElement.getBoundingClientRect();
    const found = hitAt(
        chartElement,
        point.x - origin.left,
        point.y - origin.top,
    );
    if (!found) return null;
    return {
        target: chartTarget(found, tile),
        rect: new DOMRect(
            origin.left + found.rect.x,
            origin.top + found.rect.y,
            found.rect.width,
            found.rect.height,
        ),
    };
};
