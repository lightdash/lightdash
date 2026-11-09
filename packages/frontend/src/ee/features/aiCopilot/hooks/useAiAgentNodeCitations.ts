import {
    type AiAgentNodeCitationPipeline,
    type ApiAiAgentComposerArtifactVizQuery,
    type ApiAiAgentComposerArtifactVizQueryResponse,
    type ApiAiAgentNodeCitationPipelineResponse,
    type ApiAiAgentThreadComposerNodesResponse,
    type ApiError,
    type AiAgentThreadComposerNode,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { getAiAccessRefusal } from '../../../../features/aiAccess/errors';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';
import { useUiString } from '../../../providers/Embed/useUiStrings';
import {
    getAiAgentApiBase,
    getAiAgentNodeCitationUrl,
    type NodeCitationRef,
} from './aiAgentRouting';

const NO_NODES: readonly AiAgentThreadComposerNode[] = [];

/** Nodes a finished message's citations resolve against, keyed per message. */
export const useAiAgentThreadComposerNodes = ({
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
}): readonly AiAgentThreadComposerNode[] => {
    const lightdashApi = useLightdashApi();
    const query = useQuery<
        ApiAiAgentThreadComposerNodesResponse['results'],
        ApiError
    >({
        queryKey: [
            'aiAgentThreadComposerNodes',
            projectUuid,
            agentUuid,
            threadUuid,
            messageUuid,
        ],
        queryFn: () =>
            lightdashApi<ApiAiAgentThreadComposerNodesResponse['results']>({
                url: `${getAiAgentApiBase(projectUuid)}/${agentUuid}/threads/${threadUuid}/nodes`,
                method: 'GET',
                body: undefined,
            }),
        enabled,
        refetchOnWindowFocus: false,
    });
    // A failed refetch keeps the last read; until a read succeeds citations stay plain text.
    return query.data ?? NO_NODES;
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
                url: getAiAgentNodeCitationUrl(ref),
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
                    url: `${getAiAgentNodeCitationUrl(ref)}/viz-query`,
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
