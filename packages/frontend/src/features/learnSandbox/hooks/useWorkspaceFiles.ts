import {
    type ApiError,
    type LearnWorkspaceFileSummary,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { getWorkspaceFiles } from '../api';

export const workspaceFilesQueryKey = (projectUuid: string) => [
    'learnSandbox',
    'workspaceFiles',
    projectUuid,
];

export const useWorkspaceFiles = (projectUuid: string) =>
    useQuery<LearnWorkspaceFileSummary[], ApiError>({
        queryKey: workspaceFilesQueryKey(projectUuid),
        queryFn: () => getWorkspaceFiles(projectUuid),
    });
