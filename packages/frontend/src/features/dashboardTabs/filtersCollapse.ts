/**
 * Whether the floating edit bar's switch collapses the filters bar (else
 * the bar's own toggle or Hide does, in local state). Editing it is the
 * switch, except with the controls and no edit bar, where the toggle stays.
 */
export const isEditSwitchCollapse = ({
    isEditMode,
    isEditErgonomicsEnabled,
    isDashboardControlsEnabled,
}: {
    isEditMode: boolean;
    isEditErgonomicsEnabled: boolean;
    isDashboardControlsEnabled: boolean;
}) => isEditMode && (isEditErgonomicsEnabled || !isDashboardControlsEnabled);
