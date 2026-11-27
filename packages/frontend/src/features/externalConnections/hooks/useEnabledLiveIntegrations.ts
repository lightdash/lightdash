import { type ApiConnectorType, type ApiError } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

/** The integrations the organization has turned on, each by its feature flag. */
export const useEnabledLiveIntegrations = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiConnectorType[], ApiError>({
        queryKey: ['external-connections', projectUuid, 'live-integrations'],
        queryFn: () =>
            lightdashApi<ApiConnectorType[]>({
                url: `/ee/projects/${projectUuid}/external-connections/live-integrations`,
                method: 'GET',
                body: undefined,
            }),
    });
};
