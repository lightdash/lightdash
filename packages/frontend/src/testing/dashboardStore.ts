import {
    type DashboardFilters,
    type DashboardParameters,
    type ParameterDefinitions,
    type ParametersValuesMap,
} from '@lightdash/common';
import {
    buildInitialDashboardState,
    createDashboardStore,
    type DashboardStore,
} from '../features/dashboard/store';
import { toDashboardParameters } from '../providers/Dashboard/dashboardParametersUrl';

export type DashboardStoreTestValues = Partial<{
    dashboardFilters: DashboardFilters;
    /** Raw temporary filters; locks are applied by the read hooks */
    dashboardTemporaryFilters: DashboardFilters;
    originalDashboardFilters: DashboardFilters;
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
}>;

/** A real dashboard store seeded with the given state, for component tests */
export const createDashboardTestStore = (
    values: DashboardStoreTestValues = {},
): DashboardStore => {
    const { state } = buildInitialDashboardState({
        search: '',
        isEditMode: values.isEditMode ?? false,
        parameterLabelOverrides: undefined,
    });
    const filters = { ...state.filters };
    if (values.dashboardFilters) {
        filters.dashboardFilters = values.dashboardFilters;
    }
    if (values.dashboardTemporaryFilters) {
        filters.temporaryFilters = values.dashboardTemporaryFilters;
    }
    if (values.originalDashboardFilters) {
        filters.originalDashboardFilters = values.originalDashboardFilters;
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
    return createDashboardStore({ filters, parameters });
};
