import type {
    AiArtifact,
    AllVizChartConfig,
    ApiError,
    ApiSuccessEmpty,
    ApiUpdateComposerVizConfigRequest,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { type LightdashApi } from '../../../../api';
import {
    getAiAccessRefusal,
    isAiAgentAuthorizationError,
} from '../../../../features/aiAccess/errors';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';
import useIsEmbedded from '../../../providers/Embed/useIsEmbedded';
import { getAiAgentApiBase, getAiAgentPageBase } from './aiAgentRouting';

export const AI_AGENT_ARTIFACT_KEY = 'aiAgentArtifact';

export type AiAgentArtifactVersionRef = {
    projectUuid: string;
    agentUuid: string;
    artifactUuid: string;
    versionUuid: string;
};

const getAiAgentArtifact = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    agentUuid: string,
    artifactUuid: string,
): Promise<AiArtifact> => {
    return lightdashApi<AiArtifact>({
        version: 'v1',
        url: `${getAiAgentApiBase(
            projectUuid,
        )}/${agentUuid}/artifacts/${artifactUuid}`,
        method: 'GET',
        body: undefined,
    });
};

const getAiAgentArtifactVersion = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    agentUuid: string,
    artifactUuid: string,
    versionUuid: string,
): Promise<AiArtifact> => {
    return lightdashApi<AiArtifact>({
        version: 'v1',
        url: `${getAiAgentApiBase(
            projectUuid,
        )}/${agentUuid}/artifacts/${artifactUuid}/versions/${versionUuid}`,
        method: 'GET',
        body: undefined,
    });
};

/** Key and fetcher shared by every observer of one artifact version. */
export const aiAgentArtifactVersionQuery = (
    lightdashApi: LightdashApi,
    {
        projectUuid,
        agentUuid,
        artifactUuid,
        versionUuid,
    }: AiAgentArtifactVersionRef,
) => ({
    queryKey: [
        AI_AGENT_ARTIFACT_KEY,
        projectUuid,
        agentUuid,
        artifactUuid,
        'version',
        versionUuid,
    ],
    queryFn: () =>
        getAiAgentArtifactVersion(
            lightdashApi,
            projectUuid,
            agentUuid,
            artifactUuid,
            versionUuid,
        ),
});

type UseAiAgentArtifactProps = {
    projectUuid: string;
    agentUuid: string;
    artifactUuid?: string;
    versionUuid?: string;
    options?: UseQueryOptions<AiArtifact, ApiError>;
};

export const useAiAgentArtifact = ({
    projectUuid,
    agentUuid,
    artifactUuid,
    versionUuid,
    options,
}: UseAiAgentArtifactProps) => {
    const lightdashApi = useLightdashApi();

    const isEmbed = useIsEmbedded();
    const navigate = useNavigate();
    const { showToastApiError } = useToaster();

    const { queryKey, queryFn } =
        versionUuid && artifactUuid
            ? aiAgentArtifactVersionQuery(lightdashApi, {
                  projectUuid,
                  agentUuid,
                  artifactUuid,
                  versionUuid,
              })
            : {
                  queryKey: [
                      AI_AGENT_ARTIFACT_KEY,
                      projectUuid,
                      agentUuid,
                      artifactUuid,
                  ],
                  queryFn: () =>
                      getAiAgentArtifact(
                          lightdashApi,
                          projectUuid,
                          agentUuid,
                          artifactUuid!,
                      ),
              };

    return useQuery<AiArtifact, ApiError>({
        queryKey,
        queryFn,
        ...options,
        onError: (error) => {
            if (isAiAgentAuthorizationError(error.error)) {
                void navigate(
                    `${getAiAgentPageBase(projectUuid, isEmbed)}/not-authorized`,
                );
            } else if (!getAiAccessRefusal(error.error)) {
                showToastApiError({
                    title: versionUuid
                        ? 'Failed to fetch artifact version'
                        : 'Failed to fetch artifact',
                    apiError: error.error,
                });
            }
            options?.onError?.(error);
        },
        enabled: !!artifactUuid && !!versionUuid && options?.enabled,
        ...options,
    });
};

type ArtifactVersionRef = {
    projectUuid: string;
    agentUuid: string;
    artifactUuid: string;
    versionUuid: string;
};

/** Writes the terminal node's viz config onto a composer artifact version. */
export const useUpdateComposerVizConfig = ({
    projectUuid,
    agentUuid,
    artifactUuid,
    versionUuid,
}: ArtifactVersionRef) => {
    const lightdashApi = useLightdashApi();

    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();

    return useMutation<ApiSuccessEmpty, ApiError, AllVizChartConfig>({
        mutationKey: [
            AI_AGENT_ARTIFACT_KEY,
            'vizConfig',
            artifactUuid,
            versionUuid,
        ],
        mutationFn: (vizConfig) =>
            lightdashApi<ApiSuccessEmpty>({
                url: `${getAiAgentApiBase(projectUuid)}/${agentUuid}/artifacts/${artifactUuid}/versions/${versionUuid}/viz-config`,
                method: 'PATCH',
                body: JSON.stringify({
                    vizConfig,
                } satisfies ApiUpdateComposerVizConfigRequest),
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: [
                    AI_AGENT_ARTIFACT_KEY,
                    projectUuid,
                    agentUuid,
                    artifactUuid,
                ],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Chart change not saved',
                apiError: error,
            });
        },
    });
};
