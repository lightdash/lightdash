import type { DashboardTilePosition } from '../types/dashboard';

export const DASHBOARD_GRID_COLUMNS = 36;

/** A complete, non-overlapping placement; array indices identify the charts. */
export const isValidDashboardTilePositions = (
    positions: readonly DashboardTilePosition[],
    chartCount: number,
): boolean => {
    if (positions.length !== chartCount || positions.length > 1_000)
        return false;
    if (
        positions.some(
            ({ x, y, w, h }) =>
                ![x, y, w, h].every(Number.isSafeInteger) ||
                x < 0 ||
                y < 0 ||
                w < 1 ||
                h < 1 ||
                x + w > DASHBOARD_GRID_COLUMNS ||
                y + h > 10_000,
        )
    )
        return false;
    return positions.every((position, index) =>
        positions
            .slice(index + 1)
            .every(
                (other) =>
                    position.x + position.w <= other.x ||
                    other.x + other.w <= position.x ||
                    position.y + position.h <= other.y ||
                    other.y + other.h <= position.y,
            ),
    );
};
