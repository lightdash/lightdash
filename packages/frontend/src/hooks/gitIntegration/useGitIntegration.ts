import type { ApiError, GitIntegrationConfiguration } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

const getGitIntegration = async (projectUuid: string) =>
    lightdashApi<any>({
        url: `/projects/${projectUuid}/git-integration`,
        method: 'GET',
        body: undefined,
    });

export const useGitIntegration = (projectUuid: string) =>
    useQuery<GitIntegrationConfiguration, ApiError>({
        queryKey: ['git-integration', projectUuid],
        queryFn: () => getGitIntegration(projectUuid),
        enabled: !!projectUuid, // Don't fetch if is empty string
        retry: false,
    });
