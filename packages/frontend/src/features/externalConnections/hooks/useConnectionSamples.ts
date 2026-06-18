import {
    type ApiError,
    type ExternalConnectionSample,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const getConnectionSamples = async (
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
) =>
    useQuery<ExternalConnectionSample[], ApiError>({
        queryKey: ['external-connection-samples', projectUuid, connectionUuid],
        queryFn: () => getConnectionSamples(projectUuid!, connectionUuid!),
        enabled: !!projectUuid && !!connectionUuid,
    });
