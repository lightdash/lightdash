import type { ApiError, GitIntegrationConfiguration } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

const getGitIntegration = async () =>
    lightdashApi<any>({
        url: `/github/config`,
        method: 'GET',
        body: undefined,
    });

export const useGitIntegration = () =>
    useQuery<GitIntegrationConfiguration, ApiError>({
        queryKey: ['git-integration'],
        queryFn: () => getGitIntegration(),
        retry: false,
    });
