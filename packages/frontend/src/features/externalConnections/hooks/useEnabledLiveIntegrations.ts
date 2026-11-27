import { type ApiConnectorType, type ApiError } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

/** The integrations the organization has turned on, each by its feature flag. */
export const useEnabledLiveIntegrations = () => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiConnectorType[], ApiError>({
        queryKey: ['live-integrations', 'enabled'],
        queryFn: () =>
            lightdashApi<ApiConnectorType[]>({
                url: `/ee/org/live-integrations`,
                method: 'GET',
                body: undefined,
            }),
    });
};
