import type {
    DashboardDAO,
    Explore,
    ParametersValuesMap,
} from '@lightdash/common';
import type { DbProjectParameter } from '../../database/entities/projectParameters';

export const getDashboardParametersValuesMap = (
    dashboard: DashboardDAO,
): ParametersValuesMap | undefined => {
    const { parameters: rawDashboardParameters } = dashboard;

    // Convert dashboard parameters to ParametersValuesMap format
    return rawDashboardParameters
        ? Object.fromEntries(
              Object.entries(rawDashboardParameters).map(
                  ([key, dashboardParam]) => [key, dashboardParam.value],
              ),
          )
        : undefined;
};

/**
 * Combine project and explore parameters
 * @param projectParameters - The project parameters
 * @param exploreParameters - The explore parameters
 * @returns An array of available parameter names
 */
export const combineProjectAndExploreParameters = (
    projectParameters: DbProjectParameter[],
    exploreParameters: Explore['parameters'],
): string[] => {
    const projectParameterNames = projectParameters.map(
        (parameter) => parameter.name,
    );
    const exploreParameterNames = Object.keys(exploreParameters || {});

    return [...projectParameterNames, ...exploreParameterNames];
};
