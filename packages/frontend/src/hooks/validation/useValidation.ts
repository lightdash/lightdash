import { ApiError, ValidationResponse } from '@lightdash/common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../../api';

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
        queryFn: () => getValidation(projectUuid),
    });
};
