import { ApiError, ValidationResponse } from '@lightdash/common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../../api';

const sortAlphabetically = (a: ValidationResponse, b: ValidationResponse) => {
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
const sortByType = (a: ValidationResponse, b: ValidationResponse) => {
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

const getValidation = async (
    projectUuid: string,
): Promise<ValidationResponse[]> =>
    lightdashApi<ValidationResponse[]>({
        url: `/projects/${projectUuid}/validate`,
        method: 'GET',
        body: undefined,
    });

export const useValidation = (projectUuid: string) => {
    return useQuery<ValidationResponse[], ApiError>({
        queryKey: 'validation',
        queryFn: () =>
            getValidation(projectUuid).then((res) =>
                res.sort(sortAlphabetically).sort(sortByType),
            ),
    });
};
