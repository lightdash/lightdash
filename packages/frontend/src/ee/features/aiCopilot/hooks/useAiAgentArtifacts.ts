import type { ApiAiAgentArtifactResponse, ApiError } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

const AI_AGENT_ARTIFACT_KEY = 'aiAgentArtifact';

const getAiAgentArtifact = async (
    projectUuid: string,
    agentUuid: string,
    artifactUuid: string,
): Promise<ApiAiAgentArtifactResponse['results']> =>
    lightdashApi<ApiAiAgentArtifactResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/artifacts/${artifactUuid}`,
        method: 'GET',
        body: undefined,
    });

const getAiAgentArtifactVersion = async (
    projectUuid: string,
    agentUuid: string,
    artifactUuid: string,
    versionUuid: string,
): Promise<ApiAiAgentArtifactResponse['results']> =>
    lightdashApi<ApiAiAgentArtifactResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/artifacts/${artifactUuid}/versions/${versionUuid}`,
        method: 'GET',
        body: undefined,
    });

type UseAiAgentArtifactProps = {
    projectUuid: string;
    agentUuid: string;
    artifactUuid: string;
    versionUuid?: string;
    options?: UseQueryOptions<ApiAiAgentArtifactResponse['results'], ApiError>;
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
                  artifactUuid,
                  versionUuid,
              )
        : () => getAiAgentArtifact(projectUuid, agentUuid, artifactUuid);

    return useQuery<ApiAiAgentArtifactResponse['results'], ApiError>({
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
        ...options,
    });
};
