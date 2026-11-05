import { type DashboardTab, type DashboardTile } from '@lightdash/common';
import { useEffect, useMemo, useState } from 'react';
import {
    canFitGridToScreen,
    FIT_TO_SCREEN_GRID_BOTTOM_PADDING,
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

type UseFitToScreenArgs = {
    isFitToScreen: boolean;
    isEditMode: boolean;
    gridElement: HTMLElement | null;
    tiles: DashboardTile[] | undefined;
    tabs: DashboardTab[];
    activeTabUuid: string | undefined;
};

/**
 * Fit to screen is offered in view mode on wide layouts when the active tab is
 * at most 2 screens tall. `rowHeight` is null when fit isn't applied.
 */
export const useFitToScreen = ({
    isFitToScreen,
    isEditMode,
    gridElement,
    tiles,
    tabs,
    activeTabUuid,
}: UseFitToScreenArgs): { isAvailable: boolean; rowHeight: number | null } => {
    const viewport = useGridViewport(gridElement, !isEditMode);
    const totalRows = useMemo(
        () =>
            getGridTotalRows(
                getViewModeActiveTabTiles(tiles ?? [], tabs, activeTabUuid),
            ),
        [tiles, tabs, activeTabUuid],
    );

    if (isEditMode || !viewport) return { isAvailable: false, rowHeight: null };

    const isAvailable =
        isFitToScreenBreakpoint(
            getBreakpointForWidth(GRID_BREAKPOINTS, viewport.width),
        ) && canFitGridToScreen(viewport.availableHeight, totalRows);

    return {
        isAvailable,
        rowHeight:
            isFitToScreen && isAvailable
                ? getFitToScreenRowHeight(viewport.availableHeight, totalRows)
                : null,
    };
};
