import {
    DashboardTileTypes,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import { sortBy } from 'es-toolkit/compat';
import { type Layout } from 'react-grid-layout';

/**
 * Tiles are stored in 36 columns, and the grid shows the same count at every
 * width that isn't the phone stack: any other count turns positions into
 * fractions that the grid rounds or pushes down a row. Narrower windows just
 * get narrower columns. The breakpoints only decide where the phone stack
 * starts and where fit to screen is offered.
 */
export const GRID_DESKTOP_COLS = 36;

/** The narrowest a tile can be resized to, in stored columns */
const MIN_TILE_COLS = 4;

export const GRID_BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 0 };
type GridBreakpoint = keyof typeof GRID_BREAKPOINTS;
export type DashboardLayouts = Record<GridBreakpoint, Layout[]>;
/**
 * Row height: fontSize * lineHeight + padding + borders
 */
export const DEFAULT_ROW_HEIGHT = 14 * 1.5 + 16 * 2 + 2;

/** Mirrors react-grid-layout: the largest breakpoint strictly narrower than `width`. */
export const getBreakpointForWidth = (
    breakpoints: Record<string, number>,
    width: number,
): string => {
    const ascending = Object.entries(breakpoints).sort(([, a], [, b]) => a - b);
    const [name] =
        ascending.filter(([, minWidth]) => width > minWidth).at(-1) ??
        ascending[0];
    return name;
};

export const GRID_MARGIN: [number, number] = [10, 10];
// Room for the floating edit action bar, so it never covers the last row
export const EDIT_ACTION_BAR_CLEARANCE = 80;
export const GRID_CONTAINER_PADDING: [number, number] = [10, 0];

/**
 * The grid itself has no gaps: each tile is inset by half a gap on every side
 * (styles/react-grid.css), so the gap no longer eats into every column and a
 * finer grid keeps usable columns on narrow windows. Tiles land on the same
 * pixels as with a grid margin.
 */
const GRID_TILE_GUTTER = GRID_MARGIN[0] / 2;

/**
 * How many finer steps the edit grid splits each stored grid unit into.
 * Positions are stored in base units, so a finer step saves as a fraction
 * (x: 14.5); the stored columns are `real` and the API types them as doubles.
 */
export const FINE_GRID_SCALE = 2;

/** Row height for a grid split `gridScale` times: that many rows plus the
 * gaps between them span exactly one base row */
export const getRowHeightForScale = (gridScale: number): number =>
    (DEFAULT_ROW_HEIGHT + GRID_MARGIN[1]) / gridScale - GRID_MARGIN[1];

export const FIT_TO_SCREEN_MIN_ROW_HEIGHT = 20;
export const FIT_TO_SCREEN_GRID_BOTTOM_PADDING = GRID_MARGIN[1];
/** Grids taller than this many viewports are too long to squash into one */
const FIT_TO_SCREEN_MAX_VIEWPORTS = 2;
const FIT_TO_SCREEN_BREAKPOINTS = new Set(['lg', 'md']);

/**
 * Auto fit (the always-on experiment) is gentler than the toggle: rows are
 * only squashed down to this fraction of the default row height, so big
 * numbers keep their minimum legible size. Longer grids keep their height.
 */
export const AUTO_FIT_MIN_SCALE = 0.75;
/** Short grids stretch to fill the viewport, up to this many times a row */
export const AUTO_FIT_MAX_SCALE = 2;
/** How long the tiles spring to a new snap target, matched by the CSS easing */
export const FIT_TO_SCREEN_SNAP_DURATION_MS = 700;

export const isFitToScreenBreakpoint = (breakpoint: string): boolean =>
    FIT_TO_SCREEN_BREAKPOINTS.has(breakpoint);

/**
 * Tiles on the grid shown in view mode: the active tab's, or every tile not on
 * a hidden tab when there are no tabs to switch between. Tiles with a stale
 * tab fall back to the first tab.
 */
export const getViewModeActiveTabTiles = (
    tiles: DashboardTile[],
    tabs: DashboardTab[],
    activeTabUuid: string | undefined,
): DashboardTile[] => {
    const visibleTabs = tabs.filter((tab) => !tab.hidden);
    if (visibleTabs.length <= 1) {
        const hiddenTabUuids = new Set(
            tabs.filter((tab) => tab.hidden).map((tab) => tab.uuid),
        );
        return tiles.filter(
            (tile) => !tile.tabUuid || !hiddenTabUuids.has(tile.tabUuid),
        );
    }
    const tabUuids = new Set(tabs.map((tab) => tab.uuid));
    const defaultTabUuid = tabs[0]?.uuid;
    return tiles.filter(
        (tile) =>
            (tile.tabUuid && tabUuids.has(tile.tabUuid)
                ? tile.tabUuid
                : defaultTabUuid) === activeTabUuid,
    );
};

export const getGridTotalRows = (
    tiles: Pick<DashboardTile, 'y' | 'h'>[],
): number => tiles.reduce((max, tile) => Math.max(max, tile.y + tile.h), 0);

/** Pixel height react-grid-layout gives a grid of `totalRows` rows */
export const getGridHeight = (totalRows: number, rowHeight: number): number =>
    totalRows * rowHeight +
    Math.max(0, totalRows - 1) * GRID_MARGIN[1] +
    GRID_CONTAINER_PADDING[1] * 2;

export const canFitGridToScreen = (
    availableHeight: number,
    totalRows: number,
): boolean =>
    totalRows > 0 &&
    availableHeight > 0 &&
    getGridHeight(totalRows, DEFAULT_ROW_HEIGHT) <=
        availableHeight * FIT_TO_SCREEN_MAX_VIEWPORTS;

/**
 * Auto fit: the row height that fills the viewport, capped on the stretch
 * side. Null when filling it would squash rows below the floor, so the grid
 * keeps its natural height.
 */
export const getAutoFitRowHeight = (
    availableHeight: number,
    totalRows: number,
): number | null => {
    if (totalRows <= 0 || availableHeight <= 0) return null;
    const rowHeight = getFitToScreenRowHeight(availableHeight, totalRows);
    if (rowHeight < DEFAULT_ROW_HEIGHT * AUTO_FIT_MIN_SCALE) return null;
    return Math.min(rowHeight, DEFAULT_ROW_HEIGHT * AUTO_FIT_MAX_SCALE);
};

/** Row height that makes `totalRows` rows fill `availableHeight` exactly */
export const getFitToScreenRowHeight = (
    availableHeight: number,
    totalRows: number,
): number => {
    if (totalRows <= 0) return DEFAULT_ROW_HEIGHT;
    // 1px slack: react-grid-layout rounds each tile's top and height
    const rowHeight =
        (availableHeight -
            1 -
            GRID_CONTAINER_PADDING[1] * 2 -
            (totalRows - 1) * GRID_MARGIN[1]) /
        totalRows;
    return Math.max(FIT_TO_SCREEN_MIN_ROW_HEIGHT, rowHeight);
};

/**
 * Converts a layout from react-grid-layout back to stored units, for saving
 * after a drag or resize. The grid works in `gridScale` steps per stored unit
 * (FINE_GRID_SCALE for the fine edit grid), so a fine step saves as a
 * fraction such as x: 14.5.
 */
export const convertLayoutToBaseCoordinates = (
    layout: Layout[],
    gridScale = 1,
): Layout[] =>
    layout.map((item) => ({
        ...item,
        x: item.x / gridScale,
        w: item.w / gridScale,
        y: item.y / gridScale,
        h: item.h / gridScale,
    }));

/** Whether a drag or resize left the tile somewhere else or at another size */
export const hasGridItemMoved = (before: Layout, after: Layout): boolean =>
    before.x !== after.x ||
    before.y !== after.y ||
    before.w !== after.w ||
    before.h !== after.h;

type GridRect = Pick<Layout, 'i' | 'x' | 'y' | 'w' | 'h'>;

const rectsOverlap = (a: GridRect, b: GridRect): boolean =>
    a.i !== b.i &&
    a.x < b.x + b.w &&
    b.x < a.x + a.w &&
    a.y < b.y + b.h &&
    b.y < a.y + a.h;

export const settleLayoutAfterEdit = ({
    layout,
    editedTileId,
    previous,
    home,
}: {
    layout: Layout[];
    editedTileId: string;
    previous: ReadonlyMap<string, GridRect>;
    home: ReadonlyMap<string, number>;
}): Layout[] => {
    const edited = layout.find((item) => item.i === editedTileId);
    if (!edited) return layout;

    const order = new Map(layout.map((item, index) => [item.i, index]));
    const byRow = (a: Layout, b: Layout) =>
        a.y - b.y || (order.get(a.i) ?? 0) - (order.get(b.i) ?? 0);
    const isFree = (item: Layout, placed: Layout[]) =>
        !placed.some((other) => rectsOverlap(item, other));

    const others = layout
        .filter((item) => item.i !== editedTileId)
        .map((drawn) => {
            const before = previous.get(drawn.i) ?? drawn;
            return {
                drawn,
                item: {
                    ...drawn,
                    x: before.x,
                    y: before.y,
                    w: before.w,
                    h: before.h,
                },
            };
        })
        .sort((a, b) => byRow(a.item, b.item));

    const placed: Layout[] = [edited];
    for (const { drawn, item } of others) {
        let next = item;
        const swappedUp = { ...item, y: Math.floor(drawn.y) };
        if (!isFree(next, placed) && drawn.y < item.y) {
            if (isFree(swappedUp, placed)) next = swappedUp;
        }
        let blockers = placed.filter((other) => rectsOverlap(next, other));
        while (blockers.length > 0) {
            next = {
                ...next,
                y: Math.ceil(
                    Math.max(...blockers.map((other) => other.y + other.h)),
                ),
            };
            blockers = placed.filter((other) => rectsOverlap(next, other));
        }
        placed.push(next);
    }

    placed
        .slice(1)
        .sort(byRow)
        .forEach((item) => {
            const homeRow = home.get(item.i);
            if (homeRow === undefined || homeRow >= item.y) return;
            const index = placed.findIndex((other) => other.i === item.i);
            const rest = placed.filter((other) => other.i !== item.i);
            const freeRow = [
                homeRow,
                ...rest
                    .map((other) => Math.ceil(other.y + other.h))
                    .filter((row) => row > homeRow && row < item.y),
            ]
                .sort((a, b) => a - b)
                .find((row) => isFree({ ...item, y: row }, rest));
            if (freeRow !== undefined) {
                placed[index] = { ...item, y: freeRow };
            }
        });

    const placedById = new Map(placed.map((item) => [item.i, item]));
    return layout.map((item) => placedById.get(item.i) ?? item);
};

export const keepResizedTileCorner = (
    layout: Layout[],
    before: Layout,
): Layout[] =>
    layout.map((item) =>
        item.i === before.i ? { ...item, x: before.x, y: before.y } : item,
    );

export const matchesSavedLayout = (
    layout: Layout[],
    saved: ReadonlyMap<string, GridRect>,
): boolean =>
    layout.every((item) => {
        const tile = saved.get(item.i);
        return tile !== undefined && !hasGridItemMoved(tile, item);
    });

export const getLayoutToSaveAfterEdit = ({
    layout,
    before,
    after,
    gridScale,
    previous,
    home,
}: {
    layout: Layout[];
    before: Layout;
    after: Layout;
    gridScale: number;
    previous: ReadonlyMap<string, GridRect>;
    home: ReadonlyMap<string, number>;
}): Layout[] | null => {
    if (!hasGridItemMoved(before, after)) return null;
    const isResize = before.w !== after.w || before.h !== after.h;
    const settled = settleLayoutAfterEdit({
        layout: convertLayoutToBaseCoordinates(
            isResize ? keepResizedTileCorner(layout, before) : layout,
            gridScale,
        ),
        editedTileId: after.i,
        previous,
        home,
    });
    return matchesSavedLayout(settled, previous) ? null : settled;
};

export const withGridItem = (layout: Layout[], item: Layout): Layout[] =>
    layout.map((other) => (other.i === item.i ? item : other));

/** Whether any tile ends somewhere else or at another size */
export const hasLayoutChanged = (before: Layout[], after: Layout[]): boolean =>
    after.some((item) => {
        const previous = before.find((other) => other.i === item.i);
        return !previous || hasGridItemMoved(previous, item);
    });

export const countResizedItems = (before: Layout[], after: Layout[]): number =>
    after.filter((item) => {
        const previous = before.find((other) => other.i === item.i);
        return previous && (previous.w !== item.w || previous.h !== item.h);
    }).length;

export type PointerPosition = { clientX: number; clientY: number };

/** Drags report mouse events, or touch events on touch screens */
export const getPointerPosition = (
    event: MouseEvent | TouchEvent,
): PointerPosition | null => {
    if (!('changedTouches' in event)) return event;
    const touch = event.changedTouches[0] ?? event.touches[0];
    return touch ?? null;
};

const PINNED_GRID_ITEM_PROPERTIES = ['top', 'left', 'width', 'height'] as const;

const findGridItem = (node: HTMLElement): HTMLElement | null =>
    node.closest<HTMLElement>('.react-grid-item');

/**
 * Records where a tile sits as its drag or resize starts, so styles can hold
 * it there while only the drop shadow follows the pointer. The record stays
 * after the drop: the tile's travel to its new place starts from it.
 */
export const pinGridItem = (node: HTMLElement): void => {
    const item = findGridItem(node);
    if (!item) return;
    PINNED_GRID_ITEM_PROPERTIES.forEach((property) =>
        item.style.setProperty(
            `--pinned-${property}`,
            item.style.getPropertyValue(property),
        ),
    );
};

const doGridItemsOverlap = (a: Layout, b: Layout): boolean =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * Settles a drop made while tiles could overlap: the dropped tiles stay where
 * they were put, and every tile they cover moves down until nothing overlaps.
 */
export const resolveDropOverlaps = (
    layout: Layout[],
    droppedIds: string[],
    rowStep = 1,
): Layout[] => {
    const isDropped = (item: Layout) => droppedIds.includes(item.i);
    const settled = sortBy(
        layout.filter((item) => !isDropped(item)),
        ['y', 'x'],
    ).reduce<Layout[]>((placed, item) => {
        const settle = (candidate: Layout): Layout => {
            const blockers = placed.filter((other) =>
                doGridItemsOverlap(candidate, other),
            );
            return blockers.length === 0
                ? candidate
                : settle({
                      ...candidate,
                      y:
                          Math.ceil(
                              Math.max(...blockers.map((b) => b.y + b.h)) /
                                  rowStep,
                          ) * rowStep,
                  });
        };
        return [...placed, settle(item)];
    }, layout.filter(isDropped));
    const settledById = new Map(settled.map((item) => [item.i, item]));
    return layout.map((item) => settledById.get(item.i) ?? item);
};

/** The share of a tile's width, at each side, that offers a slot beside it */
const SNAP_ZONE_WIDTH_RATIO = 0.25;

export type SnapTarget = {
    tileId: string;
    side: 'before' | 'after';
};

export type SnapPlacement = {
    /** Where the dragged tile lands */
    slot: Layout;
    /** The whole layout once the row has made room */
    layout: Layout[];
};

/**
 * Dropping a tile beside another one adds it to that tile's row: every tile
 * starting on the same line shares the full width equally with the newcomer.
 * No insertion when the shares would be narrower than a tile can be.
 */
export const getRowInsertion = ({
    layout,
    draggedId,
    target,
    cols,
}: {
    layout: Layout[];
    draggedId: string;
    target: SnapTarget;
    cols: number;
}): SnapPlacement | null => {
    const dragged = layout.find((item) => item.i === draggedId);
    const targetItem = layout.find((item) => item.i === target.tileId);
    if (!dragged || !targetItem || dragged.i === targetItem.i) return null;

    // A tile reaching down into the row from above would be covered by it
    const isRowCrossed = layout.some(
        (item) =>
            item.i !== draggedId &&
            item.y < targetItem.y &&
            item.y + item.h > targetItem.y,
    );
    if (isRowCrossed) return null;

    const row = sortBy(
        layout.filter(
            (item) => item.i !== draggedId && item.y === targetItem.y,
        ),
        ['x'],
    );
    const index =
        row.findIndex((item) => item.i === targetItem.i) +
        (target.side === 'after' ? 1 : 0);
    const count = row.length + 1;
    const share = Math.floor(cols / count);
    const minShare = Math.max(
        ...[dragged, ...row].map((item) => item.minW ?? 1),
    );
    if (share < minShare) return null;

    // Columns that don't divide evenly go to the leftmost tiles
    const spare = cols - share * count;
    const placed = [
        ...row.slice(0, index),
        { ...dragged, y: targetItem.y, h: targetItem.h },
        ...row.slice(index),
    ].map((item, position) => ({
        ...item,
        x: position * share + Math.min(position, spare),
        w: share + (position < spare ? 1 : 0),
    }));
    const placedById = new Map(placed.map((item) => [item.i, item]));

    return {
        slot: placed[index],
        layout: resolveDropOverlaps(
            layout.map((item) => placedById.get(item.i) ?? item),
            placed.map((item) => item.i),
        ),
    };
};

export type GridCell = { x: number; y: number };

/**
 * The grid cell under the pointer, measured from a tile whose place on screen
 * and in the grid are both known. Tiles sit edge to edge, so any tile gives
 * the size of a cell, zoom included.
 */
export const getPointerCell = ({
    pointer,
    tile,
    tileRect,
}: {
    pointer: PointerPosition;
    tile: Layout;
    tileRect: { left: number; top: number; width: number; height: number };
}): GridCell => ({
    x:
        tile.x +
        Math.floor(
            (pointer.clientX - tileRect.left) / (tileRect.width / tile.w),
        ),
    y:
        tile.y +
        Math.floor(
            (pointer.clientY - tileRect.top) / (tileRect.height / tile.h),
        ),
});

/**
 * Dropping a tile on empty space fills that space: the tile stretches to the
 * tiles and grid edges around the cell. Space with nothing below it ends where
 * the tiles beside it end; with none beside it either there is no gap to fill.
 */
export const getGapFill = ({
    layout,
    draggedId,
    cell,
    cols,
}: {
    layout: Layout[];
    draggedId: string;
    cell: GridCell;
    cols: number;
}): SnapPlacement | null => {
    const dragged = layout.find((item) => item.i === draggedId);
    if (!dragged || cell.x < 0 || cell.x >= cols || cell.y < 0) return null;

    const isOnCell = (item: Layout) =>
        item.x <= cell.x &&
        cell.x < item.x + item.w &&
        item.y <= cell.y &&
        cell.y < item.y + item.h;
    // Over its own place the tile is being nudged, not sent to a gap
    if (layout.some(isOnCell)) return null;

    const others = layout.filter((item) => item.i !== draggedId);
    const onLine = others.filter(
        (item) => item.y <= cell.y && cell.y < item.y + item.h,
    );

    const left = Math.max(
        0,
        ...onLine
            .filter((item) => item.x + item.w <= cell.x)
            .map((item) => item.x + item.w),
    );
    const right = Math.min(
        cols,
        ...onLine.filter((item) => item.x > cell.x).map((item) => item.x),
    );
    const inColumn = others.filter(
        (item) => item.x < right && item.x + item.w > left,
    );
    const top = Math.max(
        0,
        ...inColumn
            .filter((item) => item.y + item.h <= cell.y)
            .map((item) => item.y + item.h),
    );
    const floors = [
        ...inColumn.filter((item) => item.y > cell.y).map((item) => item.y),
        ...(onLine.length > 0
            ? [Math.max(...onLine.map((item) => item.y + item.h))]
            : []),
    ];
    if (floors.length === 0) return null;

    const slot = {
        ...dragged,
        x: left,
        y: top,
        w: right - left,
        h: Math.min(...floors) - top,
    };
    if (slot.w < (dragged.minW ?? 1) || slot.h < (dragged.minH ?? 1))
        return null;

    return {
        slot,
        layout: layout.map((item) => (item.i === draggedId ? slot : item)),
    };
};

/** The tile under the pointer, when the pointer is in one of its side zones */
export const getSnapTarget = (
    pointer: PointerPosition,
    draggedId: string,
): SnapTarget | null => {
    const tile = document
        .elementsFromPoint(pointer.clientX, pointer.clientY)
        .find(
            (element): element is HTMLElement =>
                element instanceof HTMLElement &&
                element.matches('.react-grid-item[data-tile-uuid]') &&
                element.dataset.tileUuid !== draggedId,
        );
    const tileId = tile?.dataset.tileUuid;
    if (!tile || !tileId) return null;

    const { left, width } = tile.getBoundingClientRect();
    const position = (pointer.clientX - left) / width;
    if (position < SNAP_ZONE_WIDTH_RATIO) return { tileId, side: 'before' };
    if (position > 1 - SNAP_ZONE_WIDTH_RATIO) return { tileId, side: 'after' };
    return null;
};
export type ResizeHandle = NonNullable<Layout['resizeHandles']>[number];

export const DEFAULT_RESIZE_HANDLES: ResizeHandle[] = ['se'];

// No top corners: they sit under the tile's drag grip and actions menu
export const EDIT_RESIZE_HANDLES: ResizeHandle[] = [
    'n',
    'e',
    's',
    'w',
    'se',
    'sw',
];

export type ResponsiveGridLayoutProps = {
    compactType: null;
    draggableCancel: string;
    useCSSTransforms: boolean;
    measureBeforeMount: boolean;
    breakpoints: typeof GRID_BREAKPOINTS;
    cols: Record<GridBreakpoint, number>;
    rowHeight: number;
    margin: [number, number];
    containerPadding: [number, number];
};

export const getReactGridLayoutConfig = (
    tile: DashboardTile,
    isEditMode = false,
    gridScale = 1,
): Layout => ({
    minH: gridScale,
    minW: MIN_TILE_COLS * gridScale,
    x: tile.x * gridScale,
    y: tile.y * gridScale,
    w: tile.w * gridScale,
    h: tile.h * gridScale,
    i: tile.uuid,
    isDraggable: isEditMode,
    isResizable: isEditMode,
});

export const getMobileGridLayout = (tiles: DashboardTile[]): Layout[] => {
    let y = 0;
    return [...tiles]
        .sort((a, b) => a.y - b.y || a.x - b.x || a.uuid.localeCompare(b.uuid))
        .map((tile) => {
            const h =
                tile.type === DashboardTileTypes.HEADING ||
                tile.type === DashboardTileTypes.MARKDOWN
                    ? tile.h
                    : tile.type === DashboardTileTypes.LOOM
                      ? 4
                      : tile.type === DashboardTileTypes.SAVED_CHART ||
                          tile.type === DashboardTileTypes.SQL_CHART
                        ? Math.max(5, Math.min(Math.ceil(tile.h * 0.75), 8))
                        : Math.max(5, Math.min(tile.h, 8));
            const layout: Layout = {
                i: tile.uuid,
                x: 0,
                y,
                w: 1,
                h,
                minW: 1,
                minH: 1,
                isDraggable: false,
                isResizable: false,
            };
            y += h;
            return layout;
        });
};

/** One desktop layout for every width; phones get the stack unless editing */
export const getDashboardLayouts = (
    tiles: DashboardTile[],
    isEditMode = false,
    gridScale = 1,
): DashboardLayouts => {
    const desktop = tiles.map((tile) =>
        getReactGridLayoutConfig(tile, isEditMode, gridScale),
    );
    return {
        lg: desktop,
        md: desktop,
        sm: desktop,
        xs: isEditMode ? desktop : getMobileGridLayout(tiles),
    };
};

export const getResponsiveGridLayoutProps = ({
    enableAnimation = false,
    stackVerticallyOnSmallestBreakpoint = false,
    isEditMode = false,
    rowHeight = DEFAULT_ROW_HEIGHT,
    gridScale = 1,
    containerPadding = GRID_CONTAINER_PADDING,
}: {
    enableAnimation?: boolean;
    isEditMode?: boolean;
    /** Visible height of one row, without the gap below it */
    rowHeight?: number;
    /** Space between the grid's edge and the visible tiles */
    containerPadding?: [number, number];
    /** Splits every column into this many, for the fine edit grid */
    gridScale?: number;

    /**
     * If enabled, we set the grid on the smallest breakpoint to have a single
     * column, which makes it behave like a simple vertical stack on mobile
     * viewports.
     */
    stackVerticallyOnSmallestBreakpoint?: boolean;
} = {}): ResponsiveGridLayoutProps => ({
    compactType: null,
    draggableCancel: '.non-draggable',
    useCSSTransforms: enableAnimation,
    measureBeforeMount: !enableAnimation,
    breakpoints: GRID_BREAKPOINTS,
    cols: {
        lg: GRID_DESKTOP_COLS * gridScale,
        md: GRID_DESKTOP_COLS * gridScale,
        sm: stackVerticallyOnSmallestBreakpoint
            ? 1
            : GRID_DESKTOP_COLS * gridScale,
        xs: isEditMode ? GRID_DESKTOP_COLS * gridScale : 1,
    },
    // Each row and column carries its share of the gap, drawn inside tiles
    rowHeight: rowHeight + GRID_MARGIN[1],
    margin: [0, 0],
    containerPadding: [
        containerPadding[0] - GRID_TILE_GUTTER,
        containerPadding[1] - GRID_TILE_GUTTER,
    ],
});

type GridPlacement = { x: number; y: number; w: number; h: number };

const sharesColumns = (a: GridPlacement, b: GridPlacement) =>
    a.x < b.x + b.w && b.x < a.x + a.w;

/**
 * Slides every tile of one grid up until it rests on the tile above it or on
 * the top. Columns, sizes and the top-to-bottom order stay as they are.
 */
export const closeTileGaps = <T extends GridPlacement>(tiles: T[]): T[] =>
    sortBy(tiles, ['y', 'x']).reduce<T[]>(
        (placed, tile) => [
            ...placed,
            {
                ...tile,
                y: Math.max(
                    0,
                    ...placed
                        .filter((above) => sharesColumns(above, tile))
                        .map((above) => above.y + above.h),
                ),
            },
        ],
        [],
    );

const snapToFineStep = (value: number) =>
    Math.round(value * FINE_GRID_SCALE) / FINE_GRID_SCALE;

/**
 * Reading-order rows: a tile joins the row it starts in the top half of,
 * unless it sits under a tile of that row, which starts the next row.
 */
const toRows = <T extends GridPlacement>(tiles: T[]): T[][] =>
    sortBy(tiles, ['y', 'x']).reduce<T[][]>((rows, tile) => {
        const row = rows.at(-1);
        const joinsRow =
            row !== undefined &&
            tile.y < row[0].y + row[0].h / 2 &&
            !row.some((placed) => sharesColumns(placed, tile));
        return joinsRow
            ? [...rows.slice(0, -1), [...row, tile]]
            : [...rows, [tile]];
    }, []);

/** One row at `y`: full grid width in the tiles' proportions, tallest height */
const justifyRow = <T extends GridPlacement>(row: T[], y: number): T[] => {
    const leftToRight = sortBy(row, ['x']);
    const totalWidth = leftToRight.reduce((sum, tile) => sum + tile.w, 0);
    const h = Math.max(...leftToRight.map((tile) => tile.h));
    const edgeAfter = (count: number) =>
        snapToFineStep(
            (leftToRight
                .slice(0, count)
                .reduce((sum, tile) => sum + tile.w, 0) *
                GRID_DESKTOP_COLS) /
                totalWidth,
        );
    return leftToRight.map((tile, index) => {
        const x = edgeAfter(index);
        return { ...tile, x, y, w: edgeAfter(index + 1) - x, h };
    });
};

/**
 * Justified rows: gaps close, then every row spans the whole grid at one
 * height and rows stack with nothing between them. Reading order is kept.
 */
export const tidyTiles = <T extends GridPlacement>(tiles: T[]): T[] =>
    toRows(closeTileGaps(tiles)).reduce<T[]>((placed, row) => {
        const y = Math.max(0, ...placed.map((tile) => tile.y + tile.h));
        return [...placed, ...justifyRow(row, y)];
    }, []);
