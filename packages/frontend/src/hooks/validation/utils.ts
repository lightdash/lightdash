import { ValidationResponse } from '@lightdash/common';

export const sortAlphabetically = (
    a: ValidationResponse,
    b: ValidationResponse,
) => {
    const nameA = a.name.toUpperCase();
    const nameB = b.name.toUpperCase();

    if (nameA < nameB) {
        return -1;
    } else if (nameA > nameB) {
        return 1;
    } else {
        return 0;
    }
};

// Sorts validation responses by type, order is as follows: table, chart, dashboard validation errors
export const sortByType = (a: ValidationResponse, b: ValidationResponse) => {
    // Table type
    if (a.chartUuid === undefined && a.dashboardUuid === undefined) {
        if (b.chartUuid === undefined && b.dashboardUuid === undefined) {
            return 0;
        } else {
            return -1;
        }
    } else if (a.chartUuid !== undefined && b.chartUuid === undefined) {
        return -1;
    } else if (a.dashboardUuid !== undefined && b.dashboardUuid === undefined) {
        if (a.chartUuid === undefined) {
            return 1;
        } else {
            return -1;
        }
    } else {
        return 1;
    }
};
