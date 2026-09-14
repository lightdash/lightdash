import {
    isChartValidationError,
    isDataAppValidationError,
    isDashboardValidationError,
    type ValidationResponse,
} from '@lightdash/common';

export const getLinkToResource = (
    validationError: ValidationResponse,
    projectUuid: string,
) => {
    if (isChartValidationError(validationError) && validationError.chartUuid)
        return `/projects/${projectUuid}/saved/${validationError.chartUuid}`;

    if (
        isDashboardValidationError(validationError) &&
        validationError.dashboardUuid
    )
        return `/projects/${projectUuid}/dashboards/${validationError.dashboardSlug ?? validationError.dashboardUuid}/view`;

    if (isDataAppValidationError(validationError) && validationError.appUuid)
        return `/projects/${projectUuid}/apps/${validationError.appUuid}`;

    return;
};
