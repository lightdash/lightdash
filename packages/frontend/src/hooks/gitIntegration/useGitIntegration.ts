import type { ApiError, GitIntegrationConfiguration } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import { useAbilityContext } from '../../providers/Ability/useAbilityContext';

const getGitIntegration = async () =>
    lightdashApi<any>({
        url: `/github/config`,
        method: 'GET',
        body: undefined,
    });

export const useGitIntegration = () => {
    const ability = useAbilityContext();

    return useQuery<GitIntegrationConfiguration, ApiError>({
        queryKey: ['git-integration'],
        queryFn: () => getGitIntegration(),
        retry: false,
        enabled: ability?.can('manage', 'Explore'),
    });
};
