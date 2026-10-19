import { type ApiError } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import { saveWorkspaceFile } from '../api';
import { workspaceFileQueryKey } from './useWorkspaceFile';
import { workspaceFilesQueryKey } from './useWorkspaceFiles';

type SaveWorkspaceFileParams = { path: string; content: string };

export const useSaveWorkspaceFile = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();

    return useMutation<undefined, ApiError, SaveWorkspaceFileParams>({
        mutationFn: ({ path, content }) =>
            saveWorkspaceFile(lightdashApi, projectUuid, path, content),
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
