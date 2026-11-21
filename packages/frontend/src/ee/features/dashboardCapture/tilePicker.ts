import {
    DASHBOARD_GRID_COLUMNS,
    isDashboardChartTileType,
    type DashboardTile,
} from '@lightdash/common';
import { getTileTitle } from '../../../features/dashboardControls/tileProps';
import { type CaptureMark, type CaptureTarget } from '../capture/types';

const UNTITLED = 'Untitled tile';
const TILE_SELECTOR = '[data-tile-uuid]';

/** The most charts one message names in its context. */
export const MAX_CHART_CONTEXT = 3;

type ViewportPoint = { x: number; y: number };
type Cell = { x: number; y: number };

const cellTarget = (cell: Cell): CaptureTarget => ({
    kind: 'cell',
    id: `${cell.x},${cell.y}`,
    label: `empty space at column ${cell.x}, row ${cell.y}`,
    parentId: null,
});

// Viewport point to dashboard grid cell, clamped to the grid.
const cellAtPoint = (
    point: ViewportPoint,
    grid: { left: number; top: number; width: number },
    columns: number,
    rowPx: number,
): Cell => {
    const columnPx = grid.width / columns;
    return {
        x: Math.min(
            columns - 1,
            Math.max(0, Math.floor((point.x - grid.left) / columnPx)),
        ),
        y: Math.max(0, Math.floor((point.y - grid.top) / rowPx)),
    };
};

/** The topmost of the given tiles under a viewport point, with its element and what was hit inside it. */
export const tileAtPoint = (
    point: ViewportPoint,
    tiles: DashboardTile[],
): { tile: DashboardTile; element: Element; hit: Element } | null => {
    for (const hit of document.elementsFromPoint(point.x, point.y)) {
        const element = hit.closest(TILE_SELECTOR);
        const tileUuid = element?.getAttribute('data-tile-uuid');
        const tile = tiles.find((candidate) => candidate.uuid === tileUuid);
        if (element && tile) return { tile, element, hit };
    }
    return null;
};

/** A tile as a target. */
export const tileTarget = (tile: DashboardTile): CaptureTarget => ({
    kind: 'tile',
    id: tile.uuid,
    label: getTileTitle(tile, UNTITLED),
    parentId: null,
});

/**
 * Cursor: the tile under a viewport point, with its bounds. Pass the active
 * tab's tiles; a tile that is not among them is never picked.
 */
export const pickTileAt = (
    point: ViewportPoint,
    tiles: DashboardTile[],
): { target: CaptureTarget; rect: DOMRect } | null => {
    const found = tileAtPoint(point, tiles);
    if (!found) return null;
    return {
        target: tileTarget(found.tile),
        rect: found.element.getBoundingClientRect(),
    };
};

/** What is under a viewport point: a tile, or an empty cell of the grid. */
export const targetAtPoint = (
    point: ViewportPoint,
    tiles: DashboardTile[],
): CaptureTarget | null => {
    const found = tileAtPoint(point, tiles);
    if (found) return tileTarget(found.tile);

    // Use any tile on screen to learn how tall a grid row is drawn.
    const tileElement = Array.from(
        document.querySelectorAll<HTMLElement>(TILE_SELECTOR),
    ).find((element) => element.offsetParent !== null);
    const grid = tileElement?.closest('.react-grid-layout');
    const reference = tiles.find(
        (tile) => tile.uuid === tileElement?.getAttribute('data-tile-uuid'),
    );
    if (!tileElement || !grid || !reference || reference.h <= 0) return null;
    const gridRect = grid.getBoundingClientRect();
    if (point.x < gridRect.left || point.x > gridRect.right) return null;
    return cellTarget(
        cellAtPoint(
            point,
            gridRect,
            DASHBOARD_GRID_COLUMNS,
            tileElement.getBoundingClientRect().height / reference.h,
        ),
    );
};

/** The saved charts the marks are on, in mark order, no repeats, capped. */
export const chartUuidsForMarks = (
    marks: CaptureMark[],
    tiles: DashboardTile[],
): string[] => {
    const tileUuids = marks.flatMap((mark) =>
        [
            mark.target,
            mark.arrowTo,
            ...mark.covers.map((c) => c.target),
        ].flatMap((target) => {
            // A part of a tile (a bar, a cell) counts as its tile.
            if (target?.parentId) return [target.parentId];
            return target?.kind === 'tile' ? [target.id] : [];
        }),
    );
    const chartUuids = tileUuids.flatMap((tileUuid) => {
        const tile = tiles.find((candidate) => candidate.uuid === tileUuid);
        return tile &&
            isDashboardChartTileType(tile) &&
            tile.properties.savedChartUuid
            ? [tile.properties.savedChartUuid]
            : [];
    });
    return [...new Set(chartUuids)].slice(0, MAX_CHART_CONTEXT);
};

const scrolls = (element: Element): boolean => {
    const { overflowY } = getComputedStyle(element);
    return (
        (overflowY === 'auto' || overflowY === 'scroll') &&
        element.scrollHeight > element.clientHeight
    );
};

// The element the dashboard scrolls in; null when it scrolls with the window.
const innerScroller = (): Element | null => {
    let element =
        document.querySelector('.react-grid-layout')?.parentElement ?? null;
    while (element && element !== document.body) {
        if (scrolls(element)) return element;
        element = element.parentElement;
    }
    return null;
};

/** How far the dashboard is scrolled: its scrolling container, else the window. */
export const dashboardScroll = (): { x: number; y: number } => {
    const element = innerScroller();
    return element
        ? { x: element.scrollLeft, y: element.scrollTop }
        : { x: window.scrollX, y: window.scrollY };
};

/**
 * Where marks and bubbles go to scroll with the dashboard: the page itself
 * when the window scrolls it. Null when it scrolls inside an element of its own.
 */
export const dashboardScrollContainer = (): HTMLElement | null =>
    innerScroller() ? null : document.body;
