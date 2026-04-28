/**
 * Canonical chart color palette for generated data apps.
 * Cycle through these in order for multi-series charts; use CHART_COLORS[0] for
 * single-series. The underlying CSS variables are defined in chart-overrides.css
 * and mirror the palette used by every native Lightdash chart.
 */
export const CHART_COLORS = [
    'hsl(var(--chart-1))',
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))',
    'hsl(var(--chart-6))',
    'hsl(var(--chart-7))',
    'hsl(var(--chart-8))',
    'hsl(var(--chart-9))',
] as const;
