import { type ApiError } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

const getExploreFilePath = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    exploreName: string,
) =>
    lightdashApi<{ filePath: string }>({
        version: 'v1',
        url: `/projects/${projectUuid}/git-integration/explores/${encodeURIComponent(exploreName)}/file-path`,
        method: 'GET',
        body: undefined,
    });

export const useExploreFilePath = (
    projectUuid: string | undefined,
    exploreName: string | undefined,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<{ filePath: string }, ApiError>({
        queryKey: ['exploreFilePath', projectUuid, exploreName],
        queryFn: () =>
            getExploreFilePath(lightdashApi, projectUuid!, exploreName!),
        enabled: !!projectUuid && !!exploreName,
    });
};
