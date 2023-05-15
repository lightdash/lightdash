import { ApiError, ApiValidateResponse } from '@lightdash/common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../../api';

const getValidation = async (
    projectUuid: string,
): Promise<ApiValidateResponse> =>
    lightdashApi<ApiValidateResponse>({
        url: `/projects/${projectUuid}/validate`,
        method: 'GET',
        body: undefined,
    });

export const useValidation = (projectUuid: string) => {
    return useQuery<ApiValidateResponse, ApiError>({
        queryKey: 'validation',
        queryFn: () => getValidation(projectUuid),
    });
};
