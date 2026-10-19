import {
    type ApiError,
    type ExternalConnectionListItem,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

const getExternalConnections = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
) =>
    lightdashApi<ExternalConnectionListItem[]>({
        url: `/ee/projects/${projectUuid}/external-connections`,
        method: 'GET',
        body: undefined,
    });

export const useExternalConnections = (projectUuid: string | undefined) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ExternalConnectionListItem[], ApiError>({
        queryKey: ['external-connections', projectUuid],
        queryFn: () => getExternalConnections(lightdashApi, projectUuid!),
        enabled: !!projectUuid,
        // Refetch when the tab regains focus so connections created in another
        // tab (e.g. from the builder's "New connection" link) show up on return.
        refetchOnWindowFocus: true,
    });
};
