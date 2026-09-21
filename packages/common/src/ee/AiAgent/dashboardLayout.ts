import type { DashboardTilePosition } from '../../types/dashboard';
import {
    DASHBOARD_GRID_COLUMNS,
    isValidDashboardTilePositions,
} from '../../utils/dashboardTilePositions';

export const AI_DASHBOARD_LAYOUT_TEMPLATES = [
    'balanced',
    'overview',
    'analysis',
    'comparison',
    'stacked',
] as const;
export type AiDashboardLayoutTemplate =
    (typeof AI_DASHBOARD_LAYOUT_TEMPLATES)[number];
export type AiDashboardLayout = {
    template: AiDashboardLayoutTemplate;
    /** Positions retain the original visualization indices, regardless of visual order. */
    positions: DashboardTilePosition[];
};

export type AiDashboardTileShape = { summary: boolean; detailed: boolean };

/** The decision supplies IDs and a template; only code supplies grid coordinates. */
export const buildAiDashboardLayout = (
    template: AiDashboardLayoutTemplate,
    shapes: readonly AiDashboardTileShape[],
    order: readonly number[] = shapes.map((_, index) => index),
): AiDashboardLayout | undefined => {
    if (
        shapes.length < 1 ||
        shapes.length > 15 ||
        order.length !== shapes.length ||
        new Set(order).size !== shapes.length ||
        order.some(
            (index) =>
                !Number.isInteger(index) || index < 0 || index >= shapes.length,
        )
    )
        return undefined;
    const positions: DashboardTilePosition[] = [];
    const remaining = [...order];
    let y = 0;
    const placeRow = (indices: number[], h: number) => {
        const w = DASHBOARD_GRID_COLUMNS / indices.length;
        indices.forEach((index, column) => {
            positions[index] = { x: column * w, y, w, h };
        });
        y += h;
    };
    if (template === 'overview') {
        while (remaining.length && shapes[remaining[0]].summary) {
            const firstNonSummary = remaining.findIndex(
                (index) => !shapes[index].summary,
            );
            const count =
                firstNonSummary === -1 ? remaining.length : firstNonSummary;
            // Balance rows so five or nine KPIs do not leave one oversized card.
            const rowSize = Math.ceil(count / Math.ceil(count / 4));
            // Summary tables need room for their header, value and query details.
            placeRow(remaining.splice(0, rowSize), 6);
        }
    }
    if (
        (template === 'overview' || template === 'analysis') &&
        remaining.length
    ) {
        placeRow(remaining.splice(0, 1), 10);
    }
    while (remaining.length) {
        const first = remaining.shift()!;
        if (template === 'stacked') {
            placeRow([first], shapes[first].summary ? 6 : 9);
        } else if (
            (template === 'overview' || template === 'analysis') &&
            shapes[first].detailed
        ) {
            placeRow([first], 10);
        } else {
            const second = remaining[0];
            const wideNext =
                (template === 'overview' || template === 'analysis') &&
                second !== undefined &&
                shapes[second].detailed;
            const row = [first];
            if (second !== undefined && !wideNext) row.push(remaining.shift()!);
            placeRow(row, template === 'comparison' ? 9 : 8);
        }
    }
    return isValidDashboardTilePositions(positions, shapes.length)
        ? { template, positions }
        : undefined;
};

export const getAiDashboardLayoutRows = (layout: AiDashboardLayout) => {
    const rows = new Map<
        number,
        (DashboardTilePosition & { index: number })[]
    >();
    layout.positions.forEach((position, index) => {
        const row = rows.get(position.y) ?? [];
        row.push({ ...position, index });
        rows.set(position.y, row);
    });
    return [...rows.entries()]
        .sort(([a], [b]) => a - b)
        .map(([y, tiles]) => ({
            y,
            tiles: tiles.sort((a, b) => a.x - b.x),
        }));
};
