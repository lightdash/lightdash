import {
    type ApiError,
    type ApiGetAppQueriesResponse,
    type DataAppQueryManifest,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

/**
 * The build-time query manifest of the app version being shown; null when
 * that version has none or is not the latest ready one.
 */
export const useAppQueryManifest = (
    projectUuid: string | undefined,
    appUuid: string | undefined,
    version: number | undefined,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<DataAppQueryManifest | null, ApiError>({
        queryKey: ['app-query-manifest', projectUuid, appUuid, version],
        queryFn: async () => {
            const result = await lightdashApi<
                ApiGetAppQueriesResponse['results']
            >({
                method: 'GET',
                url: `/ee/projects/${projectUuid}/apps/${appUuid}/queries`,
                body: undefined,
            });
            return result.version === version ? result.queries : null;
        },
        enabled: !!projectUuid && !!appUuid && version !== undefined,
    });
};
