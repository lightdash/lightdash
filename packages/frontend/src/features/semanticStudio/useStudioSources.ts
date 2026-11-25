import {
    type ApiError,
    type SaveSemanticStudioSourceRequest,
    type SemanticStudioSourceFile,
    type SemanticStudioSources,
    type SemanticStudioSourceSave,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { type StartStudioThread, type StoredThread } from './studioChange';
import { invalidateStudio, SOURCES_KEY } from './studioQueryKeys';

export const SOURCE_PARAM = 'path';

/** `models/orders.yml` and `models/orders.sql` are the model `orders`. */
export const modelNameOfSourcePath = (path: string) =>
    (path.split('/').pop() ?? path).replace(/\.(ya?ml|sql)$/, '');

const withPrUrl = (prUrl: string | null, params: Record<string, string> = {}) =>
    new URLSearchParams(prUrl ? { ...params, prUrl } : params).toString();

/** The project's YAML and SQL files, at a change's pull request or the branch it deploys from; `head` refetches when the change moves. */
export const useStudioSources = (
    projectUuid: string,
    prUrl: string | null,
    head: string | null,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<SemanticStudioSources, ApiError>({
        queryKey: [SOURCES_KEY, projectUuid, prUrl, head, 'list'],
        queryFn: () =>
            lightdashApi<SemanticStudioSources>({
                url: `/projects/${projectUuid}/semantic-studio/sources?${withPrUrl(prUrl)}`,
                method: 'GET',
                body: undefined,
            }),
        keepPreviousData: true,
        retry: false,
    });
};

export const useStudioSourceFile = (
    projectUuid: string,
    prUrl: string | null,
    head: string | null,
    path: string | null,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<SemanticStudioSourceFile, ApiError>({
        queryKey: [SOURCES_KEY, projectUuid, prUrl, head, 'file', path],
        queryFn: () =>
            lightdashApi<SemanticStudioSourceFile>({
                url: `/projects/${projectUuid}/semantic-studio/sources/file?${withPrUrl(prUrl, { path: path ?? '' })}`,
                method: 'GET',
                body: undefined,
            }),
        enabled: path !== null,
        retry: false,
    });
};

/** Saves a hand edit as a commit on the change, then reads the files and the change's diff again. */
export const useSaveStudioSource = (
    projectUuid: string,
    startThread: StartStudioThread,
) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const pendingThread = useRef<StoredThread | null>(null);
    return useMutation<
        SemanticStudioSourceSave & { thread: StoredThread | null },
        ApiError,
        SaveSemanticStudioSourceRequest & {
            /** Saving from live with no conversation starts one with this agent, so the save becomes a change you can come back to. */
            newChangeAgentUuid: string | null;
        }
    >({
        mutationFn: async ({ newChangeAgentUuid, ...body }) => {
            // A save that then fails leaves a conversation no change points at.
            const thread =
                body.threadUuid === null && newChangeAgentUuid
                    ? (pendingThread.current ??= await startThread(
                          newChangeAgentUuid,
                          `This change started with a hand edit to ${body.path}.`,
                      ))
                    : null;
            const saved = await lightdashApi<SemanticStudioSourceSave>({
                url: `/projects/${projectUuid}/semantic-studio/sources/file`,
                method: 'POST',
                body: JSON.stringify({
                    ...body,
                    threadUuid: thread?.threadUuid ?? body.threadUuid,
                }),
            });
            return { ...saved, thread };
        },
        onSuccess: (result) => {
            if (result.status !== 'saved') return;
            pendingThread.current = null;
            void invalidateStudio(queryClient, projectUuid, {
                draft: false,
                draftState: false,
                checkout: false,
                liveModels: false,
                sources: true,
                pullRequestChecks: null,
            });
        },
    });
};
