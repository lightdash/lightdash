import type {
    AgentSkillsListing,
    AiAgentSkill,
    AiAgentSkillFiles,
    AiAgentSkillSummary,
    AiAgentSkillValidationResult,
    AiAgentSkillVersionSummary,
    ApiAgentSkillsListingResponse,
    ApiAiAgentSkillResponse,
    ApiAiAgentSkillSummaryListResponse,
    ApiAiAgentSkillValidationResponse,
    ApiAiAgentSkillVersionListResponse,
    ApiCreateAiAgentSkill,
    ApiError,
    ApiSuccess,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

export const AI_AGENT_SKILLS_KEY = 'aiAgentSkills';
export const AGENT_SKILLS_KEY = 'agentSkills';

const skillsUrl = '/aiAgents/skills';
const agentSkillsUrl = (projectUuid: string, agentUuid: string) =>
    `/projects/${projectUuid}/aiAgents/${agentUuid}/skills`;

const listAgentSkills = (projectUuid: string, agentUuid: string) =>
    lightdashApi<ApiAgentSkillsListingResponse['results']>({
        version: 'v1',
        url: agentSkillsUrl(projectUuid, agentUuid),
        method: 'GET',
        body: undefined,
    });

const setAgentSkills = (
    projectUuid: string,
    agentUuid: string,
    skillUuids: string[],
) =>
    lightdashApi<ApiAgentSkillsListingResponse['results']>({
        version: 'v1',
        url: agentSkillsUrl(projectUuid, agentUuid),
        method: 'PUT',
        body: JSON.stringify({ skillUuids }),
    });

const listSkills = (projectUuid?: string) =>
    lightdashApi<ApiAiAgentSkillSummaryListResponse['results']>({
        version: 'v1',
        url: projectUuid
            ? `${skillsUrl}?projectUuid=${encodeURIComponent(projectUuid)}`
            : skillsUrl,
        method: 'GET',
        body: undefined,
    });

const getSkill = (skillUuid: string) =>
    lightdashApi<ApiAiAgentSkillResponse['results']>({
        version: 'v1',
        url: `${skillsUrl}/${skillUuid}`,
        method: 'GET',
        body: undefined,
    });

const createSkill = (body: ApiCreateAiAgentSkill) =>
    lightdashApi<ApiAiAgentSkillResponse['results']>({
        version: 'v1',
        url: skillsUrl,
        method: 'POST',
        body: JSON.stringify(body),
    });

const updateSkill = (skillUuid: string, files: AiAgentSkillFiles) =>
    lightdashApi<ApiAiAgentSkillResponse['results']>({
        version: 'v1',
        url: `${skillsUrl}/${skillUuid}`,
        method: 'PATCH',
        body: JSON.stringify({ files }),
    });

const deleteSkill = (skillUuid: string) =>
    lightdashApi<ApiSuccess<{ unboundAgentUuids: string[] }>['results']>({
        version: 'v1',
        url: `${skillsUrl}/${skillUuid}`,
        method: 'DELETE',
        body: undefined,
    });

const validateSkill = (files: AiAgentSkillFiles) =>
    lightdashApi<ApiAiAgentSkillValidationResponse['results']>({
        version: 'v1',
        url: `${skillsUrl}/validate`,
        method: 'POST',
        body: JSON.stringify({ files }),
    });

const listVersions = (skillUuid: string) =>
    lightdashApi<ApiAiAgentSkillVersionListResponse['results']>({
        version: 'v1',
        url: `${skillsUrl}/${skillUuid}/versions`,
        method: 'GET',
        body: undefined,
    });

const restoreVersion = (skillUuid: string, versionNumber: number) =>
    lightdashApi<ApiAiAgentSkillResponse['results']>({
        version: 'v1',
        url: `${skillsUrl}/${skillUuid}/versions/${versionNumber}/restore`,
        method: 'POST',
        body: undefined,
    });

/** The skills an agent serves, for the composer and the agent form. */
export const useAgentSkills = (
    projectUuid: string | undefined,
    agentUuid: string | undefined,
) =>
    useQuery<AgentSkillsListing, ApiError>({
        queryKey: [AGENT_SKILLS_KEY, projectUuid, agentUuid],
        queryFn: () => listAgentSkills(projectUuid!, agentUuid!),
        enabled: !!projectUuid && !!agentUuid,
        staleTime: 30_000,
    });

export const useSetAgentSkills = (projectUuid: string, agentUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<AgentSkillsListing, ApiError, string[]>({
        mutationFn: (skillUuids) =>
            setAgentSkills(projectUuid, agentUuid, skillUuids),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: [AGENT_SKILLS_KEY, projectUuid, agentUuid],
            });
            await queryClient.invalidateQueries({
                queryKey: [AI_AGENT_SKILLS_KEY],
            });
        },
        onError: ({ error }) =>
            showToastApiError({
                title: 'Failed to update agent skills',
                apiError: error,
            }),
    });
};

/** The organization catalogue; needs the view scope. */
export const useAiAgentSkills = (projectUuid?: string, enabled = true) =>
    useQuery<AiAgentSkillSummary[], ApiError>({
        queryKey: [AI_AGENT_SKILLS_KEY, projectUuid ?? null],
        queryFn: () => listSkills(projectUuid),
        enabled,
        retry: false,
    });

export const useAiAgentSkill = (skillUuid: string | null) =>
    useQuery<AiAgentSkill, ApiError>({
        queryKey: [AI_AGENT_SKILLS_KEY, 'detail', skillUuid],
        queryFn: () => getSkill(skillUuid!),
        enabled: !!skillUuid,
    });

export const useAiAgentSkillVersions = (skillUuid: string | null) =>
    useQuery<AiAgentSkillVersionSummary[], ApiError>({
        queryKey: [AI_AGENT_SKILLS_KEY, 'versions', skillUuid],
        queryFn: () => listVersions(skillUuid!),
        enabled: !!skillUuid,
    });

const useInvalidateSkills = () => {
    const queryClient = useQueryClient();
    return async () => {
        await queryClient.invalidateQueries({
            queryKey: [AI_AGENT_SKILLS_KEY],
        });
        await queryClient.invalidateQueries({ queryKey: [AGENT_SKILLS_KEY] });
    };
};

export const useCreateAiAgentSkill = () => {
    const invalidate = useInvalidateSkills();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<AiAgentSkill, ApiError, ApiCreateAiAgentSkill>({
        mutationFn: createSkill,
        onSuccess: async (skill) => {
            await invalidate();
            showToastSuccess({ title: `Skill /${skill.name} created` });
        },
        onError: ({ error }) =>
            showToastApiError({
                title: 'Failed to create skill',
                apiError: error,
            }),
    });
};

export const useUpdateAiAgentSkill = () => {
    const invalidate = useInvalidateSkills();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        AiAgentSkill,
        ApiError,
        { skillUuid: string; files: AiAgentSkillFiles }
    >({
        mutationFn: ({ skillUuid, files }) => updateSkill(skillUuid, files),
        onSuccess: async (skill) => {
            await invalidate();
            showToastSuccess({
                title: `Skill /${skill.name} saved as version ${skill.currentVersion.versionNumber}`,
            });
        },
        onError: ({ error }) =>
            showToastApiError({
                title: 'Failed to save skill',
                apiError: error,
            }),
    });
};

export const useDeleteAiAgentSkill = () => {
    const invalidate = useInvalidateSkills();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<{ unboundAgentUuids: string[] }, ApiError, string>({
        mutationFn: deleteSkill,
        onSuccess: async () => {
            await invalidate();
            showToastSuccess({ title: 'Skill deleted' });
        },
        onError: ({ error }) =>
            showToastApiError({
                title: 'Failed to delete skill',
                apiError: error,
            }),
    });
};

export const useRestoreAiAgentSkillVersion = () => {
    const invalidate = useInvalidateSkills();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        AiAgentSkill,
        ApiError,
        { skillUuid: string; versionNumber: number }
    >({
        mutationFn: ({ skillUuid, versionNumber }) =>
            restoreVersion(skillUuid, versionNumber),
        onSuccess: async (skill) => {
            await invalidate();
            showToastSuccess({
                title: `Restored as version ${skill.currentVersion.versionNumber}`,
            });
        },
        onError: ({ error }) =>
            showToastApiError({
                title: 'Failed to restore version',
                apiError: error,
            }),
    });
};

export const useValidateAiAgentSkill = () =>
    useMutation<AiAgentSkillValidationResult, ApiError, AiAgentSkillFiles>({
        mutationFn: validateSkill,
    });
