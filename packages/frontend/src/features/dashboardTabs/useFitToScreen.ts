import { type DashboardTab, type DashboardTile } from '@lightdash/common';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    canFitGridToScreen,
    FIT_TO_SCREEN_GRID_BOTTOM_PADDING,
    FIT_TO_SCREEN_SNAP_DURATION_MS,
    getAutoFitToScreenSnap,
    getBreakpointForWidth,
    getFitToScreenRowHeight,
    getGridTotalRows,
    getViewModeActiveTabTiles,
    GRID_BREAKPOINTS,
    isFitToScreenBreakpoint,
    type FitToScreenSnap,
} from './gridUtils';

type GridViewport = { width: number; availableHeight: number };

/** Grid width and the viewport height left below everything above the grid */
const useGridViewport = (
    gridElement: HTMLElement | null,
    enabled: boolean,
): GridViewport | null => {
    const [viewport, setViewport] = useState<GridViewport | null>(null);

    useEffect(() => {
        if (!enabled || !gridElement) {
            setViewport(null);
            return;
        }

        const measure = () => {
            const rect = gridElement.getBoundingClientRect();
            // Document-relative, so page scroll doesn't change the result
            const top =
                rect.top - document.documentElement.getBoundingClientRect().top;
            const next = {
                width: Math.round(rect.width),
                availableHeight: Math.floor(
                    window.innerHeight -
                        top -
                        FIT_TO_SCREEN_GRID_BOTTOM_PADDING,
                ),
            };
            setViewport((prev) =>
                prev?.width === next.width &&
                prev.availableHeight === next.availableHeight
                    ? prev
                    : next,
            );
        };

        measure();
        // Header, filter bar and banners above the grid change the body size
        const observer = new ResizeObserver(measure);
        observer.observe(document.body);
        observer.observe(gridElement);
        window.addEventListener('resize', measure);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, [gridElement, enabled]);

    return viewport;
};

/**
 * True for one animation after the snap target (the rows filling the
 * viewport, or null for the natural layout) jumps to another, so the grid can
 * spring to it. Stretching within a target, and the first measured layout,
 * are not animated. `undefined` means nothing is measured yet; `resetKey`
 * changes (tab switch, edit mode) also start afresh without animating.
 */
const useSnapAnimation = (
    target: number | null | undefined,
    resetKey: string,
): boolean => {
    const [isSnapping, setIsSnapping] = useState(false);
    const previous = useRef<number | null | undefined>(undefined);

    useEffect(() => {
        previous.current = undefined;
    }, [resetKey]);

    useEffect(() => {
        const from = previous.current;
        previous.current = target;
        if (from === undefined || target === undefined || from === target) {
            return;
        }
        setIsSnapping(true);
        const timeout = setTimeout(
            () => setIsSnapping(false),
            FIT_TO_SCREEN_SNAP_DURATION_MS,
        );
        return () => clearTimeout(timeout);
    }, [target]);

    return isSnapping;
};

type UseFitToScreenArgs = {
    isFitToScreen: boolean;
    /** The always-on experiment: gentler squash, folds snap, no toggle */
    isAutoFit: boolean;
    isEditMode: boolean;
    gridElement: HTMLElement | null;
    tiles: DashboardTile[] | undefined;
    tabs: DashboardTab[];
    activeTabUuid: string | undefined;
};

type FitToScreenState = {
    /** The toggle is offered: wide layout and the active tab is at most 2 screens tall */
    isAvailable: boolean;
    /** Null when the grid keeps its natural height */
    snap: FitToScreenSnap | null;
    /** The grid is mid-spring between two snap targets */
    isSnapping: boolean;
};

/**
 * Fit to screen is applied in view mode on wide layouts. With the toggle, the
 * whole active tab fills the viewport when it is at most 2 screens tall. With
 * auto fit, the squash is gentler and a clean fold can snap to the viewport
 * bottom instead.
 */
export const useFitToScreen = ({
    isFitToScreen,
    isAutoFit,
    isEditMode,
    gridElement,
    tiles,
    tabs,
    activeTabUuid,
}: UseFitToScreenArgs): FitToScreenState => {
    const viewport = useGridViewport(gridElement, !isEditMode);
    const activeTiles = useMemo(
        () => getViewModeActiveTabTiles(tiles ?? [], tabs, activeTabUuid),
        [tiles, tabs, activeTabUuid],
    );
    const totalRows = useMemo(
        () => getGridTotalRows(activeTiles),
        [activeTiles],
    );

    const isWideLayout =
        viewport !== null &&
        isFitToScreenBreakpoint(
            getBreakpointForWidth(GRID_BREAKPOINTS, viewport.width),
        );
    const isAvailable =
        isWideLayout &&
        !isEditMode &&
        canFitGridToScreen(viewport.availableHeight, totalRows);

    const snap = useMemo<FitToScreenSnap | null>(() => {
        if (isEditMode || !isFitToScreen || viewport === null || !isWideLayout)
            return null;
        if (isAutoFit) {
            return getAutoFitToScreenSnap(
                viewport.availableHeight,
                activeTiles,
            );
        }
        if (!isAvailable) return null;
        return {
            rows: totalRows,
            rowHeight: getFitToScreenRowHeight(
                viewport.availableHeight,
                totalRows,
            ),
            isWholeGrid: true,
        };
    }, [
        isEditMode,
        isFitToScreen,
        isWideLayout,
        isAutoFit,
        isAvailable,
        viewport,
        activeTiles,
        totalRows,
    ]);

    const isSnapping = useSnapAnimation(
        viewport === null || isEditMode ? undefined : (snap?.rows ?? null),
        `${activeTabUuid ?? ''}:${isEditMode}`,
    );

    return { isAvailable, snap, isSnapping };
};
