import {
    FeatureFlags,
    getAvailableParametersFromTables,
    getTileParameterInputs,
    type DashboardConfig,
    type DashboardDAO,
    type DashboardParameterControl,
    type DashboardParameters,
    type DashboardTileParameterInputs,
    type Explore,
    type ParameterDefinitions,
    type ParametersValuesMap,
} from '@lightdash/common';
import type { DbProjectParameter } from '../../database/entities/projectParameters';
import type {
    FeatureFlagLogicArgs,
    FeatureFlagModel,
} from '../../models/FeatureFlagModel/FeatureFlagModel';

/**
 * Convert raw DashboardParameters to ParametersValuesMap format
 */
export const convertDashboardParametersToValuesMap = (
    rawDashboardParameters: DashboardParameters | undefined,
): ParametersValuesMap | undefined =>
    rawDashboardParameters
        ? Object.fromEntries(
              Object.entries(rawDashboardParameters).map(
                  ([key, dashboardParam]) => [key, dashboardParam.value],
              ),
          )
        : undefined;

/**
 * Convert dashboard parameters to ParametersValuesMap format
 * @param dashboard - The dashboard
 * @returns The dashboard parameters in ParametersValuesMap format
 */
export const getDashboardParametersValuesMap = (
    dashboard: DashboardDAO,
): ParametersValuesMap | undefined =>
    convertDashboardParametersToValuesMap(dashboard.parameters);

export const areDashboardControlsEnabled = async ({
    featureFlagModel,
    user,
}: {
    featureFlagModel: Pick<FeatureFlagModel, 'get'>;
    user: NonNullable<FeatureFlagLogicArgs['user']>;
}): Promise<boolean> =>
    (
        await featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.DashboardControls,
        })
    ).enabled;

/** Saved parameter controls, or null when unsaved or the dashboard-controls flag is off for the user (org only for embeds) */
export const getEnabledParameterControls = async ({
    featureFlagModel,
    user,
    config,
}: {
    featureFlagModel: Pick<FeatureFlagModel, 'get'>;
    user: NonNullable<FeatureFlagLogicArgs['user']>;
    config: Pick<DashboardConfig, 'parameterControls'> | undefined;
}): Promise<DashboardParameterControl[] | null> => {
    if (config?.parameterControls === undefined) return null;
    const enabled = await areDashboardControlsEnabled({
        featureFlagModel,
        user,
    });
    return enabled ? config.parameterControls : null;
};

/**
 * A tile's dashboard layer: per tile from the controls when there are any,
 * else every saved dashboard value under the request's, as before controls.
 */
export const getDashboardTileParameterLayer = ({
    parameterControls,
    dashboardParameters,
    tileUuid,
    chartSavedValues,
    requestParameters,
    userParameterNames,
}: {
    parameterControls: DashboardParameterControl[] | null;
    dashboardParameters: DashboardParameters | undefined;
    tileUuid: string;
    chartSavedValues: ParametersValuesMap;
    requestParameters: ParametersValuesMap | undefined;
    userParameterNames: string[];
}): Pick<DashboardTileParameterInputs, 'dashboardValues' | 'excludedKeys'> =>
    parameterControls === null
        ? {
              dashboardValues: {
                  ...convertDashboardParametersToValuesMap(dashboardParameters),
                  ...requestParameters,
              },
              excludedKeys: [],
          }
        : getTileParameterInputs({
              controls: parameterControls,
              tileUuid,
              // Untargeting only changes keys with a chart-saved value, so they stand in for references
              tileParameterReferences: {
                  [tileUuid]: Object.keys(chartSavedValues),
              },
              overrides: requestParameters ?? {},
              userParameterNames,
          });

/**
 * Get full parameter definitions from project and explore
 * @param projectParameters - The project parameters from database
 * @param explore - The explore
 * @returns Combined parameter definitions
 */
export const getAvailableParameterDefinitions = (
    projectParameters: DbProjectParameter[],
    explore: Explore,
): ParameterDefinitions => {
    // Get project parameter definitions
    const projectParameterDefinitions: ParameterDefinitions = {};
    projectParameters.forEach((param) => {
        projectParameterDefinitions[param.name] = {
            ...param.config,
            type: param.config.type || 'string',
        };
    });

    // Get explore (model-level) parameter definitions
    const exploreParameterDefinitions = getAvailableParametersFromTables(
        Object.values(explore.tables),
    );

    // Combine both (explore parameters override project parameters if same name)
    return {
        ...projectParameterDefinitions,
        ...exploreParameterDefinitions,
    };
};
