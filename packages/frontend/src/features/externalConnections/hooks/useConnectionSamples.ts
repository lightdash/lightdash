import {
    type ApiError,
    type ExternalConnectionSample,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

const getConnectionSamples = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    connectionUuid: string,
) =>
    lightdashApi<ExternalConnectionSample[]>({
        url: `/ee/projects/${projectUuid}/external-connections/${connectionUuid}/samples`,
        method: 'GET',
        body: undefined,
    });

export const useConnectionSamples = (
    projectUuid: string | undefined,
    connectionUuid: string | undefined,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ExternalConnectionSample[], ApiError>({
        queryKey: ['external-connection-samples', projectUuid, connectionUuid],
        queryFn: () =>
            getConnectionSamples(lightdashApi, projectUuid!, connectionUuid!),
        enabled: !!projectUuid && !!connectionUuid,
    });
};
