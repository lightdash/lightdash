import { type ApiError, type ExternalConnection } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const getExternalConnections = async (projectUuid: string) =>
    lightdashApi<ExternalConnection[]>({
        url: `/ee/projects/${projectUuid}/external-connections`,
        method: 'GET',
        body: undefined,
    });

export const useExternalConnections = (projectUuid: string | undefined) =>
    useQuery<ExternalConnection[], ApiError>({
        queryKey: ['external-connections', projectUuid],
        queryFn: () => getExternalConnections(projectUuid!),
        enabled: !!projectUuid,
    });
