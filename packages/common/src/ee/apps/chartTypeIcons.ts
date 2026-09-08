import { z } from 'zod';

/**
 * Icons a custom chart type may be drawn with, as Tabler icon names. A fixed
 * set keeps the frontend bundle flat (the full Tabler library is thousands of
 * icons), keeps the picker scannable, and gives the model a short enum to
 * choose from at first build. Null on a chart type means "no icon chosen"
 * and renders the puzzle piece.
 */
export const CHART_TYPE_ICONS = [
    // Bars, lines and areas
    'chart-bar',
    'chart-histogram',
    'chart-line',
    'chart-area',
    'chart-area-line',
    'chart-arrows',
    'chart-arrows-vertical',
    'chart-candle',
    'chart-infographic',
    // Points
    'chart-dots',
    'chart-dots-2',
    'chart-bubble',
    'chart-scatter-3d',
    'chart-grid-dots',
    // Parts of a whole
    'chart-pie',
    'chart-pie-2',
    'chart-donut',
    'chart-donut-2',
    'chart-arcs',
    'chart-circles',
    'chart-radar',
    'chart-treemap',
    'chart-sankey',
    // Structure and flow
    'hierarchy',
    'hierarchy-2',
    'binary-tree',
    'sitemap',
    'topology-star',
    'network',
    'git-branch',
    'git-merge',
    'arrows-split',
    // Place and time
    'map',
    'world',
    'timeline',
    'calendar',
    'clock',
    // Tables and values
    'table',
    'layout-grid',
    'layout-kanban',
    'list',
    'grid-dots',
    'number',
    'square-number-1',
    'percentage',
    'trending-up',
    'trending-down',
    'gauge',
    'target',
    'activity',
    'wave-sine',
    'filter',
    'stack',
    'puzzle',
] as const;

export type ChartTypeIcon = (typeof CHART_TYPE_ICONS)[number];

export const chartTypeIconSchema = z.enum(CHART_TYPE_ICONS);

export const isChartTypeIcon = (value: unknown): value is ChartTypeIcon =>
    typeof value === 'string' &&
    (CHART_TYPE_ICONS as readonly string[]).includes(value);
