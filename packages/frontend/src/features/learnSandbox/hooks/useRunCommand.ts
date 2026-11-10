import {
    type ApiError,
    type LearnSandboxCommandRequest,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import { runWorkspaceCommand } from '../api';

export const useRunCommand = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    return useMutation<
        { commandUuid: string },
        ApiError,
        LearnSandboxCommandRequest
    >({
        mutationFn: (request) =>
            runWorkspaceCommand(lightdashApi, projectUuid, request),
    });
};
