import { type DashboardTab, type DashboardTile } from '@lightdash/common';
import { useEffect, useMemo, useState } from 'react';
import {
    canFitGridToScreen,
    FIT_TO_SCREEN_GRID_BOTTOM_PADDING,
    FIT_TO_SCREEN_SNAP_DURATION_MS,
    getAutoFitRowHeight,
    getBreakpointForWidth,
    getFitToScreenRowHeight,
    getGridTotalRows,
    getViewModeActiveTabTiles,
    GRID_BREAKPOINTS,
    isFitToScreenBreakpoint,
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
 * True for one animation after the layout jumps between fitting the viewport
 * and its natural height, so the grid can spring to it. Stretching while
 * fitted, and the first measured layout, are not animated. `undefined` means
 * nothing is measured yet; `resetKey` changes (tab switch, edit mode) also
 * start afresh without animating.
 *
 * The flag is derived during render, not in an effect, so the transition
 * rule and the new row height reach the DOM in the same commit: a transition
 * only runs when the rule is already there when the height changes.
 */
const useSnapAnimation = (
    target: boolean | undefined,
    resetKey: string,
): boolean => {
    const [previous, setPrevious] = useState({ target, resetKey });
    const [snapCount, setSnapCount] = useState(0);
    const [isSnapping, setIsSnapping] = useState(false);

    if (previous.target !== target || previous.resetKey !== resetKey) {
        const shouldAnimate =
            previous.resetKey === resetKey &&
            previous.target !== undefined &&
            target !== undefined;
        setPrevious({ target, resetKey });
        if (shouldAnimate) {
            setIsSnapping(true);
            setSnapCount((count) => count + 1);
        }
    }

    useEffect(() => {
        if (!isSnapping) return;
        const timeout = setTimeout(
            () => setIsSnapping(false),
            FIT_TO_SCREEN_SNAP_DURATION_MS,
        );
        return () => clearTimeout(timeout);
    }, [isSnapping, snapCount]);

    return isSnapping;
};

type UseFitToScreenArgs = {
    isFitToScreen: boolean;
    /** The always-on experiment: gentler squash, no toggle */
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
    rowHeight: number | null;
    /** The grid is mid-spring between fitted and natural */
    isSnapping: boolean;
};

/**
 * Fit to screen is applied in view mode on wide layouts. With the toggle, the
 * whole active tab fills the viewport when it is at most 2 screens tall. With
 * auto fit the squash is gentler, so longer tabs keep their height.
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
    const totalRows = useMemo(
        () =>
            getGridTotalRows(
                getViewModeActiveTabTiles(tiles ?? [], tabs, activeTabUuid),
            ),
        [tiles, tabs, activeTabUuid],
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

    let rowHeight: number | null = null;
    if (!isEditMode && isFitToScreen && viewport !== null && isWideLayout) {
        rowHeight = isAutoFit
            ? getAutoFitRowHeight(viewport.availableHeight, totalRows)
            : isAvailable
              ? getFitToScreenRowHeight(viewport.availableHeight, totalRows)
              : null;
    }

    const isSnapping = useSnapAnimation(
        viewport === null || isEditMode ? undefined : rowHeight !== null,
        `${activeTabUuid ?? ''}:${isEditMode}`,
    );

    return { isAvailable, rowHeight, isSnapping };
};
