import {
    getAvailableParametersFromTables,
    type DashboardDAO,
    type DashboardParameters,
    type Explore,
    type ParameterDefinitions,
    type ParametersValuesMap,
} from '@lightdash/common';
import type { DbProjectParameter } from '../../database/entities/projectParameters';

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
