import type {
    ApiLearnCommandCreatedResponse,
    ApiLearnCommandOutputResponse,
    ApiLearnWorkspaceFileResponse,
    ApiLearnWorkspaceFilesResponse,
    LearnCommandOutput,
    LearnSandboxCommandRequest,
    LearnWorkspaceFile,
    LearnWorkspaceFileSummary,
} from '@lightdash/common';
import { lightdashApi } from '../../api';

export const getWorkspaceFiles = async (
    projectUuid: string,
): Promise<LearnWorkspaceFileSummary[]> =>
    lightdashApi<ApiLearnWorkspaceFilesResponse['results']>({
        url: `/projects/${projectUuid}/learn/workspace/files`,
        method: 'GET',
        body: undefined,
    });

export const getWorkspaceFile = async (
    projectUuid: string,
    path: string,
): Promise<LearnWorkspaceFile> =>
    lightdashApi<ApiLearnWorkspaceFileResponse['results']>({
        url: `/projects/${projectUuid}/learn/workspace/files/${encodeURIComponent(path)}`,
        method: 'GET',
        body: undefined,
    });

export const saveWorkspaceFile = async (
    projectUuid: string,
    path: string,
    content: string,
): Promise<undefined> =>
    lightdashApi<undefined>({
        url: `/projects/${projectUuid}/learn/workspace/files/${encodeURIComponent(path)}`,
        method: 'PUT',
        body: JSON.stringify({ content }),
    });

export const runWorkspaceCommand = async (
    projectUuid: string,
    request: LearnSandboxCommandRequest,
): Promise<{ commandUuid: string }> =>
    lightdashApi<ApiLearnCommandCreatedResponse['results']>({
        url: `/projects/${projectUuid}/learn/workspace/commands`,
        method: 'POST',
        body: JSON.stringify(request),
    });

export const getCommandOutput = async (
    projectUuid: string,
    commandUuid: string,
    after: number,
): Promise<LearnCommandOutput> =>
    lightdashApi<ApiLearnCommandOutputResponse['results']>({
        url: `/projects/${projectUuid}/learn/workspace/commands/${commandUuid}?after=${after}`,
        method: 'GET',
        body: undefined,
    });
