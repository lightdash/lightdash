import {
    type AgentCodingSession,
    type AgentCodingSessionMessage,
    type ApiError,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

// API functions
const listSessions = async (projectUuid: string) =>
    lightdashApi<AgentCodingSession[]>({
        url: `/projects/${projectUuid}/agent-coding-sessions`,
        method: 'GET',
        body: undefined,
    });

const getSession = async (projectUuid: string, sessionUuid: string) =>
    lightdashApi<AgentCodingSession>({
        url: `/projects/${projectUuid}/agent-coding-sessions/${sessionUuid}`,
        method: 'GET',
        body: undefined,
    });

const getSessionMessages = async (projectUuid: string, sessionUuid: string) =>
    lightdashApi<AgentCodingSessionMessage[]>({
        url: `/projects/${projectUuid}/agent-coding-sessions/${sessionUuid}/messages`,
        method: 'GET',
        body: undefined,
    });

const createSession = async (
    projectUuid: string,
    prompt: string,
    githubBranch: string,
) =>
    lightdashApi<AgentCodingSession>({
        url: `/projects/${projectUuid}/agent-coding-sessions`,
        method: 'POST',
        body: JSON.stringify({ prompt, githubBranch }),
    });

const sendMessage = async (
    projectUuid: string,
    sessionUuid: string,
    prompt: string,
) =>
    lightdashApi<AgentCodingSessionMessage>({
        url: `/projects/${projectUuid}/agent-coding-sessions/${sessionUuid}/messages`,
        method: 'POST',
        body: JSON.stringify({ prompt }),
    });

const deleteSession = async (projectUuid: string, sessionUuid: string) =>
    lightdashApi<null>({
        url: `/projects/${projectUuid}/agent-coding-sessions/${sessionUuid}`,
        method: 'DELETE',
        body: undefined,
    });

// Query hooks
export const useAgentCodingSessions = (projectUuid: string | undefined) =>
    useQuery<AgentCodingSession[], ApiError>({
        queryKey: ['agent-coding-sessions', projectUuid],
        queryFn: () => listSessions(projectUuid!),
        enabled: !!projectUuid,
    });

export const useAgentCodingSession = (
    projectUuid: string | undefined,
    sessionUuid: string | undefined,
) =>
    useQuery<AgentCodingSession, ApiError>({
        queryKey: ['agent-coding-session', projectUuid, sessionUuid],
        queryFn: () => getSession(projectUuid!, sessionUuid!),
        enabled: !!projectUuid && !!sessionUuid,
    });

export const useAgentCodingSessionMessages = (
    projectUuid: string | undefined,
    sessionUuid: string | undefined,
) =>
    useQuery<AgentCodingSessionMessage[], ApiError>({
        queryKey: ['agent-coding-session-messages', projectUuid, sessionUuid],
        queryFn: () => getSessionMessages(projectUuid!, sessionUuid!),
        enabled: !!projectUuid && !!sessionUuid,
    });

// Mutation hooks
export const useCreateAgentCodingSession = (projectUuid: string) => {
    const queryClient = useQueryClient();
    return useMutation<
        AgentCodingSession,
        ApiError,
        { prompt: string; githubBranch: string }
    >(
        ({ prompt, githubBranch }) =>
            createSession(projectUuid, prompt, githubBranch),
        {
            onSuccess: () => {
                void queryClient.invalidateQueries([
                    'agent-coding-sessions',
                    projectUuid,
                ]);
            },
        },
    );
};

export const useSendAgentCodingSessionMessage = (
    projectUuid: string,
    sessionUuid: string,
) => {
    const queryClient = useQueryClient();
    return useMutation<AgentCodingSessionMessage, ApiError, { prompt: string }>(
        ({ prompt }) => sendMessage(projectUuid, sessionUuid, prompt),
        {
            onSuccess: () => {
                void queryClient.invalidateQueries([
                    'agent-coding-session-messages',
                    projectUuid,
                    sessionUuid,
                ]);
            },
        },
    );
};

export const useDeleteAgentCodingSession = (projectUuid: string) => {
    const queryClient = useQueryClient();
    return useMutation<null, ApiError, string>(
        (sessionUuid) => deleteSession(projectUuid, sessionUuid),
        {
            onSuccess: () => {
                void queryClient.invalidateQueries([
                    'agent-coding-sessions',
                    projectUuid,
                ]);
            },
        },
    );
};
