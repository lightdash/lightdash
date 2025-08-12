import type { DashboardDAO, ParametersValuesMap } from '@lightdash/common';

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
