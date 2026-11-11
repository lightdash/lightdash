import { FeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';

/** Editing with the floating edit bar: its switch is the only collapse */
export const useHasControlsToggle = (isEditMode: boolean) => {
    const { data: editErgonomicsFlag } = useServerFeatureFlag(
        FeatureFlags.DashboardEditErgonomics,
    );
    return !(isEditMode && editErgonomicsFlag?.enabled === true);
};
