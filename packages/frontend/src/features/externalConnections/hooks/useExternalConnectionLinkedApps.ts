import {
    type ApiError,
    type ExternalConnectionLinkedApps,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

const getExternalConnectionLinkedApps = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    connectionUuid: string,
) =>
    lightdashApi<ExternalConnectionLinkedApps>({
        url: `/ee/projects/${projectUuid}/external-connections/${connectionUuid}/linked-apps`,
        method: 'GET',
        body: undefined,
    });

export const useExternalConnectionLinkedApps = (
    projectUuid: string | undefined,
    connectionUuid: string | undefined,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ExternalConnectionLinkedApps, ApiError>({
        queryKey: [
            'external-connection-linked-apps',
            projectUuid,
            connectionUuid,
        ],
        queryFn: () =>
            getExternalConnectionLinkedApps(
                lightdashApi,
                projectUuid!,
                connectionUuid!,
            ),
        enabled: !!projectUuid && !!connectionUuid,
    });
};
