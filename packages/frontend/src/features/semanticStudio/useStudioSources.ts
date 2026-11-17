import {
    type ApiAiAgentThreadCreateResponse,
    type ApiError,
    type SaveSemanticStudioSourceRequest,
    type SemanticStudioSourceFile,
    type SemanticStudioSources,
    type SemanticStudioSourceSave,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type StoredThread } from '../../ee/features/aiCopilot/components/SemanticStudioAgent/useSemanticStudioChat';
import { getAiAgentApiBase } from '../../ee/features/aiCopilot/hooks/aiAgentRouting';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { WORKSPACES_KEY } from './useStudioWorkspaces';

const SOURCES_KEY = 'semantic-studio-sources';

export const SOURCE_PARAM = 'path';

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
export const useSaveStudioSource = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<
        SemanticStudioSourceSave & { thread: StoredThread | null },
        ApiError,
        SaveSemanticStudioSourceRequest & {
            /** Saving from live with no conversation starts one with this agent, so the save becomes a change you can come back to. */
            newChangeAgentUuid: string | null;
        }
    >({
        mutationFn: async ({ newChangeAgentUuid, ...body }) => {
            // ponytail: a save that then fails leaves a conversation no change points at.
            const startThread = async (agentUuid: string) => {
                const created = await lightdashApi<
                    ApiAiAgentThreadCreateResponse['results']
                >({
                    url: `${getAiAgentApiBase(projectUuid)}/${agentUuid}/threads`,
                    method: 'POST',
                    body: JSON.stringify({
                        createdFrom: 'semantic_studio',
                        threadContext: `This change started with a hand edit to ${body.path}.`,
                    }),
                });
                return { threadUuid: created.uuid, agentUuid };
            };
            const thread =
                body.threadUuid === null && newChangeAgentUuid
                    ? await startThread(newChangeAgentUuid)
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
            void queryClient.invalidateQueries({ queryKey: [SOURCES_KEY] });
            void queryClient.invalidateQueries({
                queryKey: ['pullRequestDiff', projectUuid],
            });
            void queryClient.invalidateQueries({
                queryKey: [WORKSPACES_KEY, projectUuid],
            });
        },
    });
};
