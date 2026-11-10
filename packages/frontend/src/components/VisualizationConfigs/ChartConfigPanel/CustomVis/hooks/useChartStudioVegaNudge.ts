import { LightdashMode } from '@lightdash/common';
import { useCallback } from 'react';
import { useLocalStorage } from 'react-use';
import {
    selectSavedChart,
    useExplorerSelector,
} from '../../../../../features/explorer/store';
import useApp from '../../../../../providers/App/useApp';

/**
 * Whether to steer this user from Vega towards Chart Studio: Cloud only, and
 * only while creating a new chart, since an existing Vega chart is already
 * committed to Vega. Dismissal is remembered per user in this browser.
 */
export const useChartStudioVegaNudge = () => {
    const { health, user } = useApp();
    const savedChart = useExplorerSelector(selectSavedChart);
    const userUuid = user.data?.userUuid;
    const [dismissed, setDismissed] = useLocalStorage(
        `chart-studio-vega-nudge-dismissed-${userUuid ?? 'anon'}`,
        false,
    );

    const isCloud = health.data?.mode === LightdashMode.CLOUD_BETA;
    const isNewChart = savedChart === undefined;

    const dismiss = useCallback(() => setDismissed(true), [setDismissed]);

    return {
        // Wait for the user so the dismissal is read under their key, not 'anon'.
        isVisible:
            userUuid !== undefined && isCloud && isNewChart && !dismissed,
        dismiss,
    };
};
