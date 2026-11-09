import {
    getParameterMirror,
    isDashboardControlOrder,
    isEmptyDateZoomConfig,
    pruneDateZoomConfig,
    type AdditionalMetric,
    type DashboardConfig,
    type DashboardControlSection,
    type DashboardParameterControl,
    type DashboardParameters,
    type DateGranularity,
    type DateZoomConfig,
} from '@lightdash/common';
import { isEqual } from 'es-toolkit/compat';
import {
    applyParameterPicks,
    type ParameterPicks,
} from '../features/dashboard/store/parameterControls';

type BuildDashboardConfigArgs = {
    existingConfig: DashboardConfig | undefined;
    isDateZoomDisabled: boolean;
    isAddFilterDisabled: boolean;
    pinnedParameters: string[];
    parameterOrder: string[];
    hasParameterOrderChanged: boolean;
    dateZoomGranularities: (DateGranularity | string)[];
    haveDateZoomGranularitiesChanged: boolean;
    defaultDateZoomGranularity: DateGranularity | string | undefined;
    hasDefaultDateZoomGranularityChanged: boolean;
    dateZoomConfig: DateZoomConfig;
    hasDateZoomConfigChanged: boolean;
    requiredFiltersNote: string | undefined;
    stagedCustomMetrics?: AdditionalMetric[];
    controlSections: DashboardControlSection[];
    haveControlSectionsChanged: boolean;
    /** Null carries the saved list forward, keeping an absent list absent */
    parameterControlsToSave: DashboardParameterControl[] | null;
};

/**
 * Builds the full `dashboard.config` payload for a save. Every DashboardConfig
 * key must be produced here — a key that isn't is silently deleted on save.
 */
export const buildDashboardConfig = ({
    existingConfig,
    isDateZoomDisabled,
    isAddFilterDisabled,
    pinnedParameters,
    parameterOrder,
    hasParameterOrderChanged,
    dateZoomGranularities,
    haveDateZoomGranularitiesChanged,
    defaultDateZoomGranularity,
    hasDefaultDateZoomGranularityChanged,
    dateZoomConfig,
    hasDateZoomConfigChanged,
    requiredFiltersNote,
    stagedCustomMetrics,
    controlSections,
    haveControlSectionsChanged,
    parameterControlsToSave,
}: BuildDashboardConfigArgs): DashboardConfig => {
    // Prune empty controls + dangling targets on save; omit the field
    // entirely when no controls remain so untouched dashboards don't churn.
    const prunedDateZoomConfig = pruneDateZoomConfig(dateZoomConfig);
    const savedDateZoomConfig = hasDateZoomConfigChanged
        ? isEmptyDateZoomConfig(prunedDateZoomConfig)
            ? undefined
            : prunedDateZoomConfig
        : existingConfig?.dateZoomConfig;

    return {
        isDateZoomDisabled,
        isAddFilterDisabled,
        pinnedParameters,
        parameterOrder: hasParameterOrderChanged
            ? parameterOrder
            : existingConfig?.parameterOrder,
        dateZoomGranularities: haveDateZoomGranularitiesChanged
            ? dateZoomGranularities
            : existingConfig?.dateZoomGranularities,
        defaultDateZoomGranularity: hasDefaultDateZoomGranularityChanged
            ? defaultDateZoomGranularity
            : existingConfig?.defaultDateZoomGranularity,
        dateZoomConfig: savedDateZoomConfig,
        requiredFiltersNote: requiredFiltersNote || undefined,
        // Staged edits win; otherwise carry the persisted registry forward.
        customMetrics: stagedCustomMetrics ?? existingConfig?.customMetrics,
        controlSections: haveControlSectionsChanged
            ? controlSections
            : existingConfig?.controlSections,
        // No editor yet: carried forward as loaded
        parameterSections: existingConfig?.parameterSections,
        parameterControls:
            parameterControlsToSave ?? existingConfig?.parameterControls,
        // Carried forward as loaded; a malformed stored order is omitted so the save validates
        controlOrder: isDashboardControlOrder(existingConfig?.controlOrder)
            ? existingConfig.controlOrder
            : undefined,
    };
};

/**
 * What a save writes for parameters. With controls (flag on), the controls are
 * written once changed, or when picks changed a saved list's values; the
 * parameters mirror the saved controls.
 * Otherwise the applied parameters are saved and existing controls are carried forward.
 */
export const getParametersToSave = ({
    parameterControls,
    areParameterControlsSaved,
    haveParameterControlsChanged,
    parameterPicks,
    appliedParameters,
}: {
    parameterControls: DashboardParameterControl[] | null;
    areParameterControlsSaved: boolean;
    haveParameterControlsChanged: boolean;
    existingParameterControls: DashboardParameterControl[] | null;
    parameterPicks: ParameterPicks;
    appliedParameters: DashboardParameters;
    savedParameters: DashboardParameters;
}): {
    parameterControlsToSave: DashboardParameterControl[] | null;
    parameters: DashboardParameters;
} => {
    if (
        parameterControls === null ||
        (!areParameterControlsSaved && !haveParameterControlsChanged)
    ) {
        return { parameterControlsToSave: null, parameters: appliedParameters };
    }
    const controls = applyParameterPicks(parameterControls, parameterPicks);
    return {
        parameterControlsToSave:
            haveParameterControlsChanged ||
            !isEqual(controls, parameterControls)
                ? controls
                : null,
        parameters: getParameterMirror(controls),
    };
};
