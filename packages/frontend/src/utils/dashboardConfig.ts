import {
    isEmptyDateZoomConfig,
    pruneDateZoomConfig,
    type AdditionalMetric,
    type DashboardConfig,
    type DateGranularity,
    type DateZoomConfig,
} from '@lightdash/common';

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
    };
};
