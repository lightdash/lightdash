/**
 * Severity-aware markers for query-bound charts. `high`, `medium` and
 * `positive` earn a marker; `info` is context for the summary and never
 * paints a data point.
 */
import type { CSSProperties, MouseEvent } from 'react';
import type { Insight, QueryInsights } from '@lightdash/query-sdk';

const MARKED = new Set<Insight['severity']>(['high', 'medium', 'positive']);

export const MARKER_COLOR: Record<Insight['severity'], string> = {
    high: 'var(--destructive)',
    medium: 'var(--chart-4)',
    positive: 'var(--chart-2)',
    info: 'var(--muted-foreground)',
};

/** The anomaly that should mark this row, or null. */
export function markerFor(
    insights: QueryInsights,
    row: Record<string, unknown> | null | undefined,
): Insight | null {
    return (
        insights.matches(row as never).find((a) => MARKED.has(a.severity)) ??
        null
    );
}

type MarkerProps = {
    insights: QueryInsights;
    /** Opens the point's action menu; receives the row and the click event. */
    onOpenMenu: (row: Record<string, unknown>, event: MouseEvent) => void;
    /** Series colour for unflagged points; defaults to the first chart colour. */
    color?: string;
    // Recharts fills these in when the element is used as `dot` / `activeDot`.
    cx?: number;
    cy?: number;
    payload?: Record<string, unknown>;
};

/**
 * Line / area dot renderer. Pass the same element as both `dot` and
 * `activeDot` so the hover dot never covers the marker and steals the click:
 *
 *   const dot = <InsightMarker insights={insights} onOpenMenu={openMenu} />;
 *   <Line dataKey="revenue" dot={dot} activeDot={dot} />
 */
export function InsightMarker({
    insights,
    onOpenMenu,
    color = 'var(--chart-1)',
    cx,
    cy,
    payload,
}: MarkerProps) {
    if (cx == null || cy == null || !payload) return null;
    const anomaly = markerFor(insights, payload);
    const style: CSSProperties = { cursor: 'pointer' };
    return (
        <circle
            cx={cx}
            cy={cy}
            r={anomaly ? 5 : 3}
            fill={anomaly ? MARKER_COLOR[anomaly.severity] : color}
            stroke={anomaly ? 'var(--background)' : 'none'}
            strokeWidth={anomaly ? 1.5 : 0}
            style={style}
            onClick={(event) => onOpenMenu(payload, event)}
        />
    );
}

/**
 * Bar / cell props for the same treatment on categorical charts:
 *
 *   <Bar dataKey="revenue" onClick={(d, _i, e) => openMenu(d.payload, e)}>
 *     {rows.map((row) => <Cell key={row.status} {...insightCellProps(insights, row)} />)}
 *   </Bar>
 */
export function insightCellProps(
    insights: QueryInsights,
    row: Record<string, unknown>,
): { stroke?: string; strokeWidth?: number; style: CSSProperties } {
    const anomaly = markerFor(insights, row);
    return {
        stroke: anomaly ? MARKER_COLOR[anomaly.severity] : undefined,
        strokeWidth: anomaly ? 2 : 0,
        style: { cursor: 'pointer' },
    };
}

/** Text for a tooltip line under the value; null when the row is not flagged. */
export function insightTooltipText(
    insights: QueryInsights,
    row: Record<string, unknown> | null | undefined,
): string | null {
    return markerFor(insights, row)?.text ?? null;
}
