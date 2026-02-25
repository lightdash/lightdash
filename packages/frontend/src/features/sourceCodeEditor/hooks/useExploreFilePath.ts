import { type ApiError } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const getExploreFilePath = async (projectUuid: string, exploreName: string) =>
    lightdashApi<{ filePath: string }>({
        version: 'v1',
        url: `/projects/${projectUuid}/git-integration/explores/${encodeURIComponent(exploreName)}/file-path`,
        method: 'GET',
        body: undefined,
    });

export const useExploreFilePath = (
    projectUuid: string | undefined,
    exploreName: string | undefined,
) =>
    useQuery<{ filePath: string }, ApiError>({
        queryKey: ['exploreFilePath', projectUuid, exploreName],
        queryFn: () => getExploreFilePath(projectUuid!, exploreName!),
        enabled: !!projectUuid && !!exploreName,
    });
