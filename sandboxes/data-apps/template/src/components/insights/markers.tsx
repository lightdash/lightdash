/**
 * Severity-aware markers for query-bound charts. `high`, `medium` and
 * `positive` earn a marker; `info` is context for the summary and never
 * paints a data point. `fieldId` is the series' `dataKey`, so an anomaly on
 * one metric never marks the other series of the same chart.
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

/** The anomaly that should mark this row of this series, or null. */
export function markerFor(
    insights: QueryInsights,
    row: Record<string, unknown> | null | undefined,
    fieldId?: string,
): Insight | null {
    return (
        insights
            .matches(row as never, fieldId)
            .find((a) => MARKED.has(a.severity)) ?? null
    );
}

type MarkerProps = {
    insights: QueryInsights;
    /** The series' `dataKey`; passed through to `onOpenMenu`. */
    fieldId: string;
    /** Opens the point's action menu with the row, the event and the series. */
    onOpenMenu: (
        row: Record<string, unknown>,
        event: MouseEvent,
        fieldId: string,
    ) => void;
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
 *   const dot = <InsightMarker insights={insights} fieldId="revenue" onOpenMenu={openMenu} />;
 *   <Line dataKey="revenue" dot={dot} activeDot={dot} />
 */
export function InsightMarker({
    insights,
    fieldId,
    onOpenMenu,
    color = 'var(--chart-1)',
    cx,
    cy,
    payload,
}: MarkerProps) {
    if (cx == null || cy == null || !payload) return null;
    const anomaly = markerFor(insights, payload, fieldId);
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
            onClick={(event) => onOpenMenu(payload, event, fieldId)}
        />
    );
}

/**
 * Bar / cell props for the same treatment on categorical charts:
 *
 *   <Bar dataKey="revenue" onClick={(d, _i, e) => openMenu(d.payload, e, 'revenue')}>
 *     {rows.map((row) => <Cell key={row.status} {...insightCellProps(insights, row, 'revenue')} />)}
 *   </Bar>
 */
export function insightCellProps(
    insights: QueryInsights,
    row: Record<string, unknown>,
    fieldId: string,
): { stroke?: string; strokeWidth?: number; style: CSSProperties } {
    const anomaly = markerFor(insights, row, fieldId);
    return {
        stroke: anomaly ? MARKER_COLOR[anomaly.severity] : undefined,
        strokeWidth: anomaly ? 2 : 0,
        style: { cursor: 'pointer' },
    };
}

/** Text for a tooltip line under a value; null when that series' row is not
 *  flagged. Omit `fieldId` to take the first flagged series of the row. */
export function insightTooltipText(
    insights: QueryInsights,
    row: Record<string, unknown> | null | undefined,
    fieldId?: string,
): string | null {
    return markerFor(insights, row, fieldId)?.text ?? null;
}
