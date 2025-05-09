import {
    type ValidationResponse,
    isChartValidationError,
    isDashboardValidationError,
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
        return `/projects/${projectUuid}/dashboards/${validationError.dashboardUuid}/view`;

    return;
};
