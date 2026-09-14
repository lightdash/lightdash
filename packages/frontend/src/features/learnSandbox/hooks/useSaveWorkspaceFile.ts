import { type ApiError } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveWorkspaceFile } from '../api';
import { workspaceFileQueryKey } from './useWorkspaceFile';
import { workspaceFilesQueryKey } from './useWorkspaceFiles';

type SaveWorkspaceFileParams = { path: string; content: string };

export const useSaveWorkspaceFile = (projectUuid: string) => {
    const queryClient = useQueryClient();

    return useMutation<undefined, ApiError, SaveWorkspaceFileParams>({
        mutationFn: ({ path, content }) =>
            saveWorkspaceFile(projectUuid, path, content),
        onSuccess: async (_data, { path }) => {
            await queryClient.invalidateQueries({
                queryKey: workspaceFilesQueryKey(projectUuid),
            });
            await queryClient.invalidateQueries({
                queryKey: workspaceFileQueryKey(projectUuid, path),
            });
        },
    });
};
