import type { AiArtifact, ApiError, ApiSuccessEmpty } from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

const AI_AGENT_ARTIFACT_KEY = 'aiAgentArtifact';

const getAiAgentArtifact = async (
    projectUuid: string,
    agentUuid: string,
    artifactUuid: string,
): Promise<AiArtifact> => {
    return lightdashApi<AiArtifact>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/artifacts/${artifactUuid}`,
        method: 'GET',
        body: undefined,
    });
};

const getAiAgentArtifactVersion = async (
    projectUuid: string,
    agentUuid: string,
    artifactUuid: string,
    versionUuid: string,
): Promise<AiArtifact> => {
    return lightdashApi<AiArtifact>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/artifacts/${artifactUuid}/versions/${versionUuid}`,
        method: 'GET',
        body: undefined,
    });
};

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
    const navigate = useNavigate();
    const { showToastApiError } = useToaster();

    const queryKey = versionUuid
        ? [
              AI_AGENT_ARTIFACT_KEY,
              projectUuid,
              agentUuid,
              artifactUuid,
              'version',
              versionUuid,
          ]
        : [AI_AGENT_ARTIFACT_KEY, projectUuid, agentUuid, artifactUuid];

    const queryFn = versionUuid
        ? () =>
              getAiAgentArtifactVersion(
                  projectUuid,
                  agentUuid,
                  artifactUuid!,
                  versionUuid,
              )
        : () => getAiAgentArtifact(projectUuid, agentUuid, artifactUuid!);

    return useQuery<AiArtifact, ApiError>({
        queryKey,
        queryFn,
        ...options,
        onError: (error) => {
            if (error.error?.statusCode === 403) {
                void navigate(
                    `/projects/${projectUuid}/ai-agents/not-authorized`,
                );
            } else {
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

const setArtifactVersionVerified = async ({
    projectUuid,
    agentUuid,
    artifactUuid,
    versionUuid,
    verified,
}: {
    projectUuid: string;
    agentUuid: string;
    artifactUuid: string;
    versionUuid: string;
    verified: boolean;
}) =>
    lightdashApi<ApiSuccessEmpty>({
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/artifacts/${artifactUuid}/versions/${versionUuid}/verified`,
        method: `PATCH`,
        body: JSON.stringify({ verified }),
    });

export const useSetArtifactVersionVerified = (
    projectUuid: string,
    agentUuid: string,
    { showSuccessAction = true }: { showSuccessAction?: boolean } = {},
) => {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        ApiSuccessEmpty,
        ApiError,
        { artifactUuid: string; versionUuid: string; verified: boolean }
    >({
        mutationFn: ({ artifactUuid, versionUuid, verified }) => {
            return setArtifactVersionVerified({
                projectUuid,
                agentUuid,
                artifactUuid,
                versionUuid,
                verified,
            });
        },
        onSuccess: (_, { artifactUuid, versionUuid, verified }) => {
            void queryClient.invalidateQueries({
                queryKey: [
                    AI_AGENT_ARTIFACT_KEY,
                    projectUuid,
                    agentUuid,
                    artifactUuid,
                ],
            });
            if (versionUuid) {
                void queryClient.invalidateQueries({
                    queryKey: [
                        AI_AGENT_ARTIFACT_KEY,
                        projectUuid,
                        agentUuid,
                        artifactUuid,
                        'version',
                        versionUuid,
                    ],
                });
            }
            void queryClient.invalidateQueries({
                queryKey: [
                    'ai-agent-verified-artifacts',
                    projectUuid,
                    agentUuid,
                ],
            });

            showToastSuccess({
                title: verified
                    ? 'Added to verified answers list'
                    : 'Removed from verified answers list',
                action:
                    showSuccessAction && verified
                        ? {
                              children: 'Go to verified answers',
                              onClick: () => {
                                  void navigate(
                                      `/projects/${projectUuid}/ai-agents/${agentUuid}/edit/verified-artifacts`,
                                  );
                              },
                              icon: IconArrowRight,
                          }
                        : undefined,
            });
        },
        onError: ({ error }) => {
            if (error?.statusCode === 403) {
                void navigate(
                    `/projects/${projectUuid}/ai-agents/not-authorized`,
                );
            } else {
                showToastApiError({
                    title: 'Failed to update answer verification',
                    apiError: error,
                });
            }
        },
    });
};
