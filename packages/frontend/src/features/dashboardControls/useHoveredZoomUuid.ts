import { useDashboardDateZoomConfig } from '../dashboard/store';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { findZoomControl } from './zoomState';

/** The zoom pill hovered or focused on an editor's bar while nothing is edited. */
export const useHoveredZoomUuid = (): string | null => {
    const hoveredId = useControlsSidebarSelector((c) =>
        c.editing === null ? c.hoveredFilterId : null,
    );
    const config = useDashboardDateZoomConfig();
    return hoveredId !== null && findZoomControl(config, hoveredId) !== null
        ? hoveredId
        : null;
};
