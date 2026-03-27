import { type DrillThroughState } from '@lightdash/common';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { useProjectUuid } from './useProjectUuid';

/** URL search param key that carries the serialised drill-through context */
export const DRILL_THROUGH_PARAM = 'drillContext';

/**
 * Handles drill-through actions based on the configured target.
 * - 'modal': sets state so the caller can render a modal
 * - 'navigate': SPA-navigates to the target chart with drill context in the URL
 * - 'newTab': opens the target chart in a new browser tab with drill context in the URL
 */
export const useDrillThroughAction = () => {
    const projectUuid = useProjectUuid();
    const nav = useNavigate();
    const [modalState, setModalState] = useState<DrillThroughState>();

    const handleDrillThrough = useCallback(
        (config: DrillThroughState) => {
            if (!config.linkedChartUuid) return;

            const encoded = encodeURIComponent(JSON.stringify(config));
            const chartUrl = `/projects/${projectUuid}/saved/${config.linkedChartUuid}`;
            const drillUrl = `${chartUrl}?${DRILL_THROUGH_PARAM}=${encoded}`;

            switch (config.target) {
                case 'navigate':
                    void nav(drillUrl);
                    break;
                case 'newTab':
                    window.open(drillUrl, '_blank');
                    break;
                case 'modal':
                default:
                    setModalState(config);
                    break;
            }
        },
        [projectUuid, nav],
    );

    const closeModal = useCallback(() => setModalState(undefined), []);

    return { modalState, handleDrillThrough, closeModal };
};
