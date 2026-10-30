import {
    DASHBOARD_EDIT_BAND_HEIGHT,
    DASHBOARD_HEADER_HEIGHT,
} from '../../components/common/Dashboard/dashboard.constants';

// The band stands in for the header in edit mode, with the flag on, for
// users who can manage the dashboard; anyone else keeps the shipped header
export const isEditBandShown = (
    isEditMode: boolean,
    isControlsEnabled: boolean,
    canManageDashboard: boolean,
): boolean => isEditMode && isControlsEnabled && canManageDashboard;

// What sticks above the tabs: the header in edit mode (or the band in its
// place), nothing in view mode
export const getTabsStickyOffset = (
    isEditMode: boolean,
    isControlsEnabled: boolean,
    canManageDashboard: boolean,
): number => {
    if (!isEditMode) return 0;
    return isEditBandShown(isEditMode, isControlsEnabled, canManageDashboard)
        ? DASHBOARD_EDIT_BAND_HEIGHT
        : DASHBOARD_HEADER_HEIGHT;
};
