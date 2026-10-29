import { DASHBOARD_HEADER_HEIGHT } from '../../components/common/Dashboard/dashboard.constants';

// Matches `.bandScope` in DashboardHeaderGuard.module.css
export const EDIT_BAND_HEIGHT = 44;

// What sticks above the tabs: the header in edit mode (the band with the
// flag on), nothing in view mode
export const getTabsStickyOffset = (
    isEditMode: boolean,
    isControlsEnabled: boolean,
): number => {
    if (!isEditMode) return 0;
    return isControlsEnabled ? EDIT_BAND_HEIGHT : DASHBOARD_HEADER_HEIGHT;
};
