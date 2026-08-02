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
        // Refetch when the tab regains focus so connections created in another
        // tab (e.g. from the builder's "New connection" link) show up on return.
        refetchOnWindowFocus: true,
    });
