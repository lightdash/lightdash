/**
 * Canonical chart color palette for generated data apps.
 * Cycle through these in order for multi-series charts; use CHART_COLORS[0] for
 * single-series. The underlying CSS variables are defined in chart-overrides.css
 * and mirror the palette used by every native Lightdash chart.
 */
export const CHART_COLORS = [
    'var(--chart-1)',
    'var(--chart-2)',
    'var(--chart-3)',
    'var(--chart-4)',
    'var(--chart-5)',
    'var(--chart-6)',
    'var(--chart-7)',
    'var(--chart-8)',
    'var(--chart-9)',
] as const;
