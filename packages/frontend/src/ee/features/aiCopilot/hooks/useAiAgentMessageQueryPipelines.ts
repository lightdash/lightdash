import {
    type ApiAiAgentComposerArtifactVizQuery,
    type ApiAiAgentComposerArtifactVizQueryResponse,
    type ApiAiAgentMessageQueryPipelinesResponse,
    type ApiError,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { getAiAccessRefusal } from '../../../../features/aiAccess/errors';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';
import { getAiAgentApiBase } from './aiAgentRouting';

type MessageRef = {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    messageUuid: string;
};

const messageQueriesUrl = ({
    projectUuid,
    agentUuid,
    threadUuid,
    messageUuid,
}: MessageRef) =>
    `${getAiAgentApiBase(projectUuid)}/${agentUuid}/threads/${threadUuid}/messages/${messageUuid}/queries`;

export const useAiAgentMessageQueryPipelines = ({
    enabled,
    ...ref
}: MessageRef & { enabled: boolean }) => {
    const lightdashApi = useLightdashApi();
    return useQuery<
        ApiAiAgentMessageQueryPipelinesResponse['results'],
        ApiError
    >({
        queryKey: [
            'aiAgentMessageQueryPipelines',
            ref.projectUuid,
            ref.agentUuid,
            ref.threadUuid,
            ref.messageUuid,
        ],
        queryFn: () =>
            lightdashApi<ApiAiAgentMessageQueryPipelinesResponse['results']>({
                url: messageQueriesUrl(ref),
                method: 'GET',
                body: undefined,
            }),
        enabled,
        // A finished turn's pipelines never change
        staleTime: Infinity,
    });
};

/** Runs one of a message's pipelines; each open gets fresh results. */
export const useAiAgentMessageQueryPipelineVizQuery = ({
    queryUuid,
    ...ref
}: MessageRef & { queryUuid: string }) => {
    const lightdashApi = useLightdashApi();
    const { showToastApiError } = useToaster();
    return useQuery<ApiAiAgentComposerArtifactVizQuery, ApiError>({
        queryKey: [
            'aiAgentMessageQueryPipelineVizQuery',
            ref.projectUuid,
            ref.agentUuid,
            ref.threadUuid,
            ref.messageUuid,
            queryUuid,
        ],
        queryFn: () =>
            lightdashApi<ApiAiAgentComposerArtifactVizQueryResponse['results']>(
                {
                    url: `${messageQueriesUrl(ref)}/${queryUuid}/viz-query`,
                    method: 'GET',
                    body: undefined,
                },
            ),
        onError: (error) => {
            if (getAiAccessRefusal(error.error)) return;
            showToastApiError({
                title: 'Failed to run query',
                apiError: error.error,
            });
        },
    });
};
