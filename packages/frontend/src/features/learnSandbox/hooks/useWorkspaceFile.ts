import { type ApiError, type LearnWorkspaceFile } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import { getWorkspaceFile } from '../api';

/** Every open file of a workspace: what a refetch of them all invalidates. */
export const workspaceFileQueryKeyPrefix = (projectUuid: string) => [
    'learnSandbox',
    'workspaceFile',
    projectUuid,
];

export const workspaceFileQueryKey = (projectUuid: string, path: string) => [
    ...workspaceFileQueryKeyPrefix(projectUuid),
    path,
];

export const useWorkspaceFile = (projectUuid: string, path: string | null) => {
    const lightdashApi = useLightdashApi();
    return useQuery<LearnWorkspaceFile, ApiError>({
        queryKey: workspaceFileQueryKey(projectUuid, path ?? ''),
        queryFn: () => getWorkspaceFile(lightdashApi, projectUuid, path!),
        enabled: !!path,
        retry: false,
    });
};
