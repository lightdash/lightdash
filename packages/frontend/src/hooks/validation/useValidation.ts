import { ApiError, ValidationResponse } from '@lightdash/common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../../api';
import { sortAlphabetically, sortByType } from './utils';

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
