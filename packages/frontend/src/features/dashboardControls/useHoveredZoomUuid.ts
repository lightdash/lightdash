import { useDashboardDateZoomConfig } from '../dashboard/store';
import { getEditedControlId } from './editedControl';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { findZoomControl } from './zoomState';

/** The zoom row hovered or focused in the rail, unless it is the edited one. */
export const useHoveredZoomUuid = (): string | null => {
    const hoveredId = useControlsSidebarSelector((c) =>
        c.hoveredFilterId === getEditedControlId(c.editing)
            ? null
            : c.hoveredFilterId,
    );
    const config = useDashboardDateZoomConfig();
    return hoveredId !== null && findZoomControl(config, hoveredId) !== null
        ? hoveredId
        : null;
};
