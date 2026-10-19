import type { ApiError, GitIntegrationConfiguration } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useAbilityContext } from '../../providers/Ability/useAbilityContext';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';

const getGitIntegration = async (lightdashApi: LightdashApi) =>
    lightdashApi<any>({
        url: `/github/config`,
        method: 'GET',
        body: undefined,
    });

export const useGitIntegration = () => {
    const lightdashApi = useLightdashApi();
    const ability = useAbilityContext();

    return useQuery<GitIntegrationConfiguration, ApiError>({
        queryKey: ['git-integration'],
        queryFn: () => getGitIntegration(lightdashApi),
        retry: false,
        enabled: ability?.can('manage', 'Explore'),
    });
};
