import {
    type ChartZoomableField,
    type Dashboard,
    type DashboardFilters,
    type DateZoomConfig,
    type DateGranularity,
    type DashboardParameters,
    type ParameterDefinitions,
    type ParametersValuesMap,
} from '@lightdash/common';
import {
    buildInitialDashboardState,
    createDashboardStore,
    dashboardEditActions,
    getSavedDateZoomSettings,
    type DashboardStore,
} from '../features/dashboard/store';
import { toDashboardParameters } from '../providers/Dashboard/dashboardParametersUrl';
import { type SqlChartTileMetadata } from '../providers/Dashboard/types';

export type DashboardStoreTestValues = Partial<{
    dashboardFilters: DashboardFilters;
    /** Raw temporary filters; locks are applied by the read hooks */
    dashboardTemporaryFilters: DashboardFilters;
    haveFiltersChanged: boolean;
    isEditMode: boolean;
    savedParameters: DashboardParameters;
    /** Applied values; converted to dashboard parameters */
    parameterValues: ParametersValuesMap;
    parametersHaveChanged: boolean;
    parameterDefinitions: ParameterDefinitions;
    tileParameterReferences: Record<string, string[]>;
    tileChartSavedParameters: Record<string, ParametersValuesMap>;
    pinnedParameters: string[];
    havePinnedParametersChanged: boolean;
    parameterOrder: string[];
    hasParameterOrderChanged: boolean;
    dateZoomGranularity: DateGranularity | string;
    controlGranularities: Record<string, DateGranularity | string>;
    tilesWithDateZoomApplied: Set<string>;
    chartZoomableFieldsByTileUuid: Record<string, ChartZoomableField[]>;
    invalidateCache: boolean;
    sqlChartTilesMetadata: Record<string, SqlChartTileMetadata>;
}>;

/** A real dashboard store seeded with the given state, for component tests */
export const createDashboardTestStore = (
    values: DashboardStoreTestValues = {},
): DashboardStore => {
    const { state } = buildInitialDashboardState({
        search: '',
        isEditMode: values.isEditMode ?? false,
        parameterLabelOverrides: undefined,
        dateZoom: undefined,
        invalidateCache: values.invalidateCache ?? false,
    });
    const filters = { ...state.filters };
    if (values.dashboardFilters) {
        filters.dashboardFilters = values.dashboardFilters;
    }
    if (values.dashboardTemporaryFilters) {
        filters.temporaryFilters = values.dashboardTemporaryFilters;
    }
    if (values.haveFiltersChanged !== undefined) {
        filters.haveFiltersChanged = values.haveFiltersChanged;
    }
    const parameters = { ...state.parameters };
    if (values.savedParameters) {
        parameters.savedParameters = values.savedParameters;
    }
    if (values.parameterValues) {
        parameters.parameters = toDashboardParameters(values.parameterValues);
    }
    if (values.parametersHaveChanged !== undefined) {
        parameters.parametersHaveChanged = values.parametersHaveChanged;
    }
    if (values.parameterDefinitions) {
        parameters.parameterDefinitions = values.parameterDefinitions;
    }
    if (values.tileParameterReferences) {
        parameters.tileParameterReferences = values.tileParameterReferences;
    }
    if (values.tileChartSavedParameters) {
        parameters.tileChartSavedParameters = values.tileChartSavedParameters;
    }
    if (values.pinnedParameters) {
        parameters.pinnedParameters = values.pinnedParameters;
    }
    if (values.havePinnedParametersChanged !== undefined) {
        parameters.havePinnedParametersChanged =
            values.havePinnedParametersChanged;
    }
    if (values.parameterOrder) {
        parameters.parameterOrder = values.parameterOrder;
    }
    if (values.hasParameterOrderChanged !== undefined) {
        parameters.hasParameterOrderChanged = values.hasParameterOrderChanged;
    }
    const dateZoom = { ...state.dateZoom };
    if (values.dateZoomGranularity !== undefined) {
        dateZoom.granularity = values.dateZoomGranularity;
    }
    if (values.controlGranularities) {
        dateZoom.controlGranularities = values.controlGranularities;
    }
    if (values.tilesWithDateZoomApplied) {
        dateZoom.tilesWithDateZoomApplied = values.tilesWithDateZoomApplied;
    }
    if (values.chartZoomableFieldsByTileUuid) {
        dateZoom.chartZoomableFieldsByTileUuid =
            values.chartZoomableFieldsByTileUuid;
    }
    return createDashboardStore({
        filters,
        parameters,
        dateZoom,
        tileStatus: values.sqlChartTilesMetadata
            ? {
                  ...state.tileStatus,
                  sqlChartTilesMetadata: values.sqlChartTilesMetadata,
              }
            : state.tileStatus,
        edit: state.edit,
    });
};

/** Edit state as component tests used to pass it on the dashboard context */
export type DashboardEditTestValues = Partial<{
    dashboard: Pick<Dashboard, 'config'> | undefined;
    dashboardTiles: Dashboard['tiles'] | undefined;
    dashboardTabs: Dashboard['tabs'];
    activeTab: Dashboard['tabs'][number] | undefined;
    haveTilesChanged: boolean;
    haveTabsChanged: boolean;
    isDateZoomDisabled: boolean;
    isAddFilterDisabled: boolean;
    requiredFiltersNote: string;
    dateZoomConfig: DateZoomConfig;
    dateZoomGranularities: (DateGranularity | string)[];
    defaultDateZoomGranularity: DateGranularity | string;
}>;

/**
 * Writes the edit state of a context fixture into a real store through its
 * actions, so a test keeps one fixture for both and can re-seed on rerender.
 */
export const seedDashboardEditState = (
    store: DashboardStore,
    values: DashboardEditTestValues,
) => {
    const saved = getSavedDateZoomSettings(values.dashboard?.config);
    const { dispatch } = store;
    if ('dashboardTiles' in values) {
        dispatch(dashboardEditActions.setTiles(values.dashboardTiles));
    }
    if (values.dashboardTabs) {
        dispatch(dashboardEditActions.setTabs(values.dashboardTabs));
    }
    if ('activeTab' in values) {
        dispatch(dashboardEditActions.setActiveTab(values.activeTab));
    }
    if (values.haveTilesChanged !== undefined) {
        dispatch(
            dashboardEditActions.setHaveTilesChanged(values.haveTilesChanged),
        );
    }
    if (values.haveTabsChanged !== undefined) {
        dispatch(
            dashboardEditActions.setHaveTabsChanged(values.haveTabsChanged),
        );
    }
    if (values.isDateZoomDisabled !== undefined) {
        dispatch(
            dashboardEditActions.setIsDateZoomDisabled(
                values.isDateZoomDisabled,
            ),
        );
    }
    if (values.isAddFilterDisabled !== undefined) {
        dispatch(
            dashboardEditActions.setIsAddFilterDisabled(
                values.isAddFilterDisabled,
            ),
        );
    }
    if (values.requiredFiltersNote !== undefined) {
        dispatch(
            dashboardEditActions.setRequiredFiltersNote(
                values.requiredFiltersNote,
            ),
        );
    }
    if (values.dateZoomConfig) {
        dispatch(
            dashboardEditActions.setDateZoomConfig({
                value: values.dateZoomConfig,
                changed: false,
                saved: saved.dateZoomConfig,
            }),
        );
    }
    if (values.dateZoomGranularities) {
        dispatch(
            dashboardEditActions.setDateZoomGranularities({
                value: values.dateZoomGranularities,
                saved: saved.dateZoomGranularities,
            }),
        );
        dispatch(
            dashboardEditActions.setHaveDateZoomGranularitiesChanged(false),
        );
    }
    if ('defaultDateZoomGranularity' in values) {
        dispatch(
            dashboardEditActions.setDefaultDateZoomGranularity({
                value: values.defaultDateZoomGranularity,
                saved: saved.defaultDateZoomGranularity,
            }),
        );
        dispatch(
            dashboardEditActions.setHasDefaultDateZoomGranularityChanged(false),
        );
    }
    return store;
};
