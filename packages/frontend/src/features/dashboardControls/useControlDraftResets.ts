import {
    DateGranularity,
    isDashboardControlOrder,
    normalizeDateZoomConfig,
    type DashboardConfig,
} from '@lightdash/common';
import { useCallback } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    dashboardEditActions,
    dashboardParametersActions,
    useDashboardDispatch,
} from '../dashboard/store';

/**
 * The bar's drafts (sections, order, parameter controls, date zoom, the note)
 * against a saved config. `resetControlDrafts` is the dashboard's Cancel;
 * `settleControlDrafts` follows a save, whose response then seeds the rest.
 */
export const useControlDraftResets = () => {
    const dashboardDispatch = useDashboardDispatch();
    const setDateZoomGranularities = useDashboardContext(
        (c) => c.setDateZoomGranularities,
    );
    const setHaveDateZoomGranularitiesChanged = useDashboardContext(
        (c) => c.setHaveDateZoomGranularitiesChanged,
    );
    const setDefaultDateZoomGranularity = useDashboardContext(
        (c) => c.setDefaultDateZoomGranularity,
    );
    const setHasDefaultDateZoomGranularityChanged = useDashboardContext(
        (c) => c.setHasDefaultDateZoomGranularityChanged,
    );
    const setDateZoomConfig = useDashboardContext((c) => c.setDateZoomConfig);
    const setHasDateZoomConfigChanged = useDashboardContext(
        (c) => c.setHasDateZoomConfigChanged,
    );
    const setRequiredFiltersNote = useDashboardContext(
        (c) => c.setRequiredFiltersNote,
    );
    const resetControlDrafts = useCallback(
        (config: DashboardConfig | undefined) => {
            dashboardDispatch(
                dashboardEditActions.setHaveControlSectionsChanged(false),
            );
            dashboardDispatch(
                dashboardParametersActions.setHaveParameterControlsChanged(
                    false,
                ),
            );
            dashboardDispatch(
                dashboardEditActions.syncControlSections(
                    config?.controlSections ?? [],
                ),
            );
            dashboardDispatch(
                dashboardEditActions.setHasControlOrderChanged(false),
            );
            dashboardDispatch(
                dashboardEditActions.syncControlOrder(
                    isDashboardControlOrder(config?.controlOrder)
                        ? config.controlOrder
                        : undefined,
                ),
            );
            setDateZoomGranularities(
                config?.dateZoomGranularities ?? Object.values(DateGranularity),
            );
            setHaveDateZoomGranularitiesChanged(false);
            setDefaultDateZoomGranularity(config?.defaultDateZoomGranularity);
            setHasDefaultDateZoomGranularityChanged(false);
            setDateZoomConfig(normalizeDateZoomConfig(config));
            setHasDateZoomConfigChanged(false);
            setRequiredFiltersNote(undefined);
        },
        [
            dashboardDispatch,
            setDateZoomGranularities,
            setHaveDateZoomGranularitiesChanged,
            setDefaultDateZoomGranularity,
            setHasDefaultDateZoomGranularityChanged,
            setDateZoomConfig,
            setHasDateZoomConfigChanged,
            setRequiredFiltersNote,
        ],
    );
    const settleControlDrafts = useCallback(
        (savedConfig: DashboardConfig | undefined) => {
            setHaveDateZoomGranularitiesChanged(false);
            setHasDefaultDateZoomGranularityChanged(false);
            setHasDateZoomConfigChanged(false);
            dashboardDispatch(
                dashboardEditActions.setHaveControlSectionsChanged(false),
            );
            dashboardDispatch(
                dashboardEditActions.setHasControlOrderChanged(false),
            );
            // The order as saved (reconciled), not the editor's draft of it
            dashboardDispatch(
                dashboardEditActions.syncControlOrder(
                    isDashboardControlOrder(savedConfig?.controlOrder)
                        ? savedConfig.controlOrder
                        : undefined,
                ),
            );
            dashboardDispatch(
                dashboardParametersActions.setHaveParameterControlsChanged(
                    false,
                ),
            );
            setRequiredFiltersNote(undefined);
        },
        [
            dashboardDispatch,
            setHaveDateZoomGranularitiesChanged,
            setHasDefaultDateZoomGranularityChanged,
            setHasDateZoomConfigChanged,
            setRequiredFiltersNote,
        ],
    );
    return { resetControlDrafts, settleControlDrafts };
};
