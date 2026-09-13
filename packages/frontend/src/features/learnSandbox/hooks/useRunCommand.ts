import {
    type ApiError,
    type LearnSandboxCommandRequest,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { runWorkspaceCommand } from '../api';

export const useRunCommand = (projectUuid: string) =>
    useMutation<{ commandUuid: string }, ApiError, LearnSandboxCommandRequest>({
        mutationFn: (request) => runWorkspaceCommand(projectUuid, request),
    });
