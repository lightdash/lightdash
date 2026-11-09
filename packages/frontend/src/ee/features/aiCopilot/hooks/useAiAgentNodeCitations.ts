import {
    type AiAgentNodeCitationPipeline,
    type ApiAiAgentComposerArtifactVizQuery,
    type ApiAiAgentComposerArtifactVizQueryResponse,
    type ApiAiAgentNodeCitationPipelineResponse,
    type ApiAiAgentThreadComposerNodeIdsResponse,
    type ApiError,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { getAiAccessRefusal } from '../../../../features/aiAccess/errors';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';
import { useUiString } from '../../../providers/Embed/useUiStrings';
import { getAiAgentApiBase } from './aiAgentRouting';

type NodeCitationRef = {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    messageUuid: string;
    nodeId: string;
};

const nodeCitationUrl = ({
    projectUuid,
    agentUuid,
    threadUuid,
    messageUuid,
    nodeId,
}: NodeCitationRef) =>
    `${getAiAgentApiBase(projectUuid)}/${agentUuid}/threads/${threadUuid}/messages/${messageUuid}/nodes/${nodeId}`;

/**
 * The thread's composer node ids a finished message's citations resolve
 * against: null while unresolved or streaming, empty when the read failed.
 * Scoped per message since the registry grows with each turn.
 */
export const useAiAgentThreadComposerNodeIds = ({
    projectUuid,
    agentUuid,
    threadUuid,
    messageUuid,
    enabled,
}: {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    messageUuid: string;
    enabled: boolean;
}): readonly string[] | null => {
    const lightdashApi = useLightdashApi();
    const query = useQuery<
        ApiAiAgentThreadComposerNodeIdsResponse['results'],
        ApiError
    >({
        queryKey: [
            'aiAgentThreadComposerNodeIds',
            projectUuid,
            agentUuid,
            threadUuid,
            messageUuid,
        ],
        queryFn: () =>
            lightdashApi<ApiAiAgentThreadComposerNodeIdsResponse['results']>({
                url: `${getAiAgentApiBase(projectUuid)}/${agentUuid}/threads/${threadUuid}/nodes`,
                method: 'GET',
                body: undefined,
            }),
        enabled,
        refetchOnWindowFocus: false,
    });
    if (query.isError) return [];
    return query.data ?? null;
};

export const useAiAgentNodeCitationPipeline = (ref: NodeCitationRef) => {
    const lightdashApi = useLightdashApi();
    return useQuery<AiAgentNodeCitationPipeline, ApiError>({
        queryKey: [
            'aiAgentNodeCitationPipeline',
            ref.projectUuid,
            ref.agentUuid,
            ref.threadUuid,
            ref.messageUuid,
            ref.nodeId,
        ],
        queryFn: () =>
            lightdashApi<ApiAiAgentNodeCitationPipelineResponse['results']>({
                url: nodeCitationUrl(ref),
                method: 'GET',
                body: undefined,
            }),
        // A node's definition never changes once registered
        staleTime: Infinity,
    });
};

/** Runs a cited node and what it reads; each open reruns it. */
export const useAiAgentNodeCitationVizQuery = ({
    enabled,
    ...ref
}: NodeCitationRef & { enabled: boolean }) => {
    const lightdashApi = useLightdashApi();
    const { showToastApiError } = useToaster();
    const runFailedTitle = useUiString('aiAgent.nodeCitation.runFailed');
    return useQuery<ApiAiAgentComposerArtifactVizQuery, ApiError>({
        queryKey: [
            'aiAgentNodeCitationVizQuery',
            ref.projectUuid,
            ref.agentUuid,
            ref.threadUuid,
            ref.messageUuid,
            ref.nodeId,
        ],
        queryFn: () =>
            lightdashApi<ApiAiAgentComposerArtifactVizQueryResponse['results']>(
                {
                    url: `${nodeCitationUrl(ref)}/viz-query`,
                    method: 'GET',
                    body: undefined,
                },
            ),
        enabled,
        // Kept while open, dropped on close
        staleTime: Infinity,
        cacheTime: 0,
        onError: (error) => {
            if (getAiAccessRefusal(error.error)) return;
            showToastApiError({
                title: runFailedTitle,
                apiError: error.error,
            });
        },
    });
};
