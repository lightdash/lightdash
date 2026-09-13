import { type ApiError, type LearnWorkspaceFile } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { getWorkspaceFile } from '../api';

export const workspaceFileQueryKey = (projectUuid: string, path: string) => [
    'learnSandbox',
    'workspaceFile',
    projectUuid,
    path,
];

export const useWorkspaceFile = (projectUuid: string, path: string | null) =>
    useQuery<LearnWorkspaceFile, ApiError>({
        queryKey: workspaceFileQueryKey(projectUuid, path ?? ''),
        queryFn: () => getWorkspaceFile(projectUuid, path!),
        enabled: !!path,
        retry: false,
    });
