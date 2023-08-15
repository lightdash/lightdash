import { ApiError, ApiGdriveAccessTokenResponse } from '@lightdash/common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../../api';

const getGdriveAccessToken = async () =>
    lightdashApi<ApiGdriveAccessTokenResponse['results']>({
        url: `/gdrive/get-access-token`,
        method: 'GET',
        body: undefined,
    });

export const useGdriveAccessToken = () =>
    useQuery<ApiGdriveAccessTokenResponse['results'], ApiError>({
        queryKey: ['gdrive_access_token'],
        queryFn: getGdriveAccessToken,
        retry: false,
    });
