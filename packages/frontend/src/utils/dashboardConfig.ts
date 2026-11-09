import {
    getParameterMirror,
    isDashboardControlOrder,
    isEmptyDateZoomConfig,
    pruneDateZoomConfig,
    reconcileDashboardControlOrder,
    type AdditionalMetric,
    type DashboardConfig,
    type DashboardControlRef,
    type DashboardControlSection,
    type DashboardFilterRule,
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
import {
    followOrder,
    toControlRefs,
} from '../features/dashboardControls/sections';

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
    /** Null carries the stored order forward; an order is written only on a reorder */
    controlOrderToSave: DashboardControlRef[] | null;
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
    controlOrderToSave,
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
        // Else carried forward as loaded; a malformed stored order is omitted so the save validates
        controlOrder:
            controlOrderToSave ??
            (isDashboardControlOrder(existingConfig?.controlOrder)
                ? existingConfig.controlOrder
                : undefined),
    };
};

/**
 * What a save writes once the editor reordered the bar: the full order (every
 * control, its line starts), and each kind's list sorted to follow it. Null
 * when nothing was reordered, or there is no control: `[]` is never written.
 */
export const getControlOrderToSave = ({
    controlOrder,
    hasControlOrderChanged,
    dimensions,
    metrics,
    parameterControls,
    controlSections,
}: {
    controlOrder: DashboardControlRef[] | undefined;
    hasControlOrderChanged: boolean;
    dimensions: DashboardFilterRule[];
    metrics: DashboardFilterRule[];
    parameterControls: DashboardParameterControl[] | null;
    controlSections: DashboardControlSection[];
}): {
    controlOrder: DashboardControlRef[];
    dimensions: DashboardFilterRule[];
    metrics: DashboardFilterRule[];
    parameterControls: DashboardParameterControl[] | null;
    controlSections: DashboardControlSection[];
} | null => {
    if (!hasControlOrderChanged) return null;
    const refs = toControlRefs(
        reconcileDashboardControlOrder({
            controlOrder,
            filters: { dimensions, metrics },
            parameterControls: parameterControls ?? [],
            sections: controlSections,
        }),
    );
    if (refs.length === 0) return null;
    const ids = refs.map(({ id }) => id);
    return {
        controlOrder: refs,
        dimensions: followOrder(dimensions, ids),
        metrics: followOrder(metrics, ids),
        parameterControls:
            parameterControls === null
                ? null
                : followOrder(parameterControls, ids),
        controlSections: followOrder(controlSections, ids),
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
