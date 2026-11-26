import { FeatureFlags, type AiAgent, type ApiError } from '@lightdash/common';
import { useLocalStorage } from '@mantine/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { getAiAccessRefusal } from '../../../../../features/aiAccess/errors';
import {
    useStoredStudioThread,
    type StoredThread,
} from '../../../../../features/semanticStudio/studioChange';
import {
    useCanEditSemanticLayer,
    useClaimCompileFollowUp,
    useDraftCheckout,
} from '../../../../../features/semanticStudio/useSemanticLayerModel';
import {
    findThreadWorkspace,
    useActiveStudioWorkspace,
    useStudioWorkspaceAction,
    useStudioWorkspaces,
} from '../../../../../features/semanticStudio/useStudioWorkspaces';
import useToaster from '../../../../../hooks/toaster/useToaster';
import { useServerFeatureFlag } from '../../../../../hooks/useServerOrClientFeatureFlag';
import { useLightdashApi } from '../../../../../providers/LightdashApi/useLightdashApi';
import {
    getProjectAiAgentQueryKey,
    useAiAgentThread,
    useCreateAgentThreadMessageMutation,
} from '../../hooks/useProjectAiAgents';
import { isAiAgentThreadStreamActive } from '../../store/aiAgentThreadStreamSlice';
import { useAiAgentStoreSelector } from '../../store/hooks';
import { useDefaultAiAgent } from '../Launcher/useDefaultAiAgent';

const useStudioChatEnabled = (projectUuid: string): boolean => {
    const flag = useServerFeatureFlag(FeatureFlags.SemanticStudioEditing);
    const canEdit = useCanEditSemanticLayer(projectUuid);
    return flag.data?.enabled === true && canEdit;
};

/** The project's built-in Studio agent, which the server creates the first time it is asked for. */
const useBuiltInStudioAgent = (projectUuid: string, enabled: boolean) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const query = useQuery<AiAgent, ApiError>({
        queryKey: ['semantic-studio-agent', projectUuid],
        queryFn: () =>
            lightdashApi<AiAgent>({
                url: `/projects/${projectUuid}/semantic-studio/agent`,
                method: 'POST',
                body: undefined,
            }),
        enabled: enabled && projectUuid !== '',
        staleTime: Infinity,
        retry: false,
    });
    const agent = query.data;
    // The chat reads its agent from the cache and never asks for it.
    useEffect(() => {
        if (!agent) return;
        queryClient.setQueryData(
            getProjectAiAgentQueryKey(projectUuid, agent.uuid),
            agent,
        );
    }, [agent, projectUuid, queryClient]);
    return query;
};

/** The built-in agent plus the project's own, which chats started before the built-in one still belong to. */
const useKnownStudioAgents = (projectUuid: string) => {
    const isEnabled = useStudioChatEnabled(projectUuid);
    const builtIn = useBuiltInStudioAgent(projectUuid, isEnabled);
    const { agents, isLoadingAgents } = useDefaultAiAgent(projectUuid);
    return {
        isEnabled,
        agent: builtIn.data,
        agents: builtIn.data ? [builtIn.data, ...agents] : agents,
        isLoadingAgents: builtIn.isInitialLoading || isLoadingAgents,
        // Why there is no chat, in the server's words, when the built-in agent was refused.
        chatRefusal: builtIn.error?.error.message ?? null,
    };
};

/** Asks for the Studio agent with the page, so the chat loads alongside the explores and not after them; its uuid once known. */
export const usePrefetchStudioAgent = (
    projectUuid: string | undefined,
): string | null => useKnownStudioAgents(projectUuid ?? '').agent?.uuid ?? null;

// Studio's routes answer not found for a missing thread; an agent's routes have their own error for it.
const isThreadGone = (errorName: string) =>
    errorName === 'NotFoundError' || errorName === 'AiAgentNotFoundError';

/** A Studio chat's thread; one that no longer exists is forgotten instead of failing on every load. */
export const useStudioThread = (
    projectUuid: string,
    agentUuid: string | undefined,
    threadUuid: string | undefined,
) => {
    const [, setStored] = useStoredStudioThread(projectUuid);
    const { showToastApiError } = useToaster();
    return useAiAgentThread(projectUuid, agentUuid, threadUuid, {
        onError: ({ error }) => {
            if (isThreadGone(error.name)) {
                setStored((current) =>
                    current?.threadUuid === threadUuid ? null : current,
                );
            } else if (!getAiAccessRefusal(error)) {
                showToastApiError({
                    title: 'Failed to fetch AI agent thread',
                    apiError: error,
                });
            }
        },
    });
};

/** After a discard: ends the active workspace and closes its chat, so the next request starts a new one. */
export const useFinishDiscardedWork = (projectUuid: string) => {
    const [, setStored] = useStoredStudioThread(projectUuid);
    const activeWorkspace = useActiveStudioWorkspace(projectUuid);
    const { mutate } = useStudioWorkspaceAction(projectUuid);
    return () => {
        setStored(null);
        if (activeWorkspace) {
            mutate({
                kind: 'finish',
                workspaceUuid: activeWorkspace.workspaceUuid,
            });
        }
    };
};

/** The agent and thread of the chat this browser has open. */
export const useStudioAgent = (projectUuid: string) => {
    const { isEnabled, agent, agents, isLoadingAgents, chatRefusal } =
        useKnownStudioAgents(projectUuid);
    const [stored, setStored] = useStoredStudioThread(projectUuid);
    const storedAgent = agents.find(({ uuid }) => uuid === stored?.agentUuid);
    return {
        isLoadingAgents,
        isEnabled,
        chatRefusal,
        // New chats always start on the built-in agent.
        agent,
        thread:
            storedAgent && stored
                ? { agent: storedAgent, threadUuid: stored.threadUuid }
                : null,
        setStored,
    };
};

export const AGENT_WORKING_HINT = 'The agent is still working on this change.';

/** Whether the agent of this browser's open Studio chat is still mid-turn, so its change is not ready to publish. */
export const useStudioAgentWorking = (projectUuid: string): boolean => {
    const [stored] = useStoredStudioThread(projectUuid);
    const threadUuid = stored?.threadUuid ?? null;
    return useAiAgentStoreSelector((state) => {
        const stream =
            threadUuid === null
                ? undefined
                : state.aiAgentThreadStream[threadUuid];
        // A finished turn is ready even if its connection has not closed yet.
        return (
            stream !== undefined &&
            isAiAgentThreadStreamActive(stream.connection) &&
            stream.timing.finishedAt === null
        );
    });
};

/** Starts a new chat or goes back to the previous one; with `chatFollowsWorkspace`, the active workspace moves with it. */
export const useStudioThreadSwitch = (
    projectUuid: string,
    { chatFollowsWorkspace }: { chatFollowsWorkspace: boolean },
) => {
    const { agents } = useKnownStudioAgents(projectUuid);
    const [stored, setStored] = useStoredStudioThread(projectUuid);
    // One chat back, not a history; the workspaces list holds the rest.
    const [previous, setPrevious] = useLocalStorage<StoredThread | null>({
        key: `semantic-studio-agent-previous-thread-${projectUuid}`,
        defaultValue: null,
        getInitialValueInEffect: false,
    });
    const { data: workspaces } = useStudioWorkspaces(projectUuid);
    const workspaceAction = useStudioWorkspaceAction(projectUuid);
    // Switching chats switches workspaces: the one you talk in is the one your changes go to.
    const follow = (next: StoredThread | null) => {
        if (!chatFollowsWorkspace) return;
        const workspace = findThreadWorkspace(
            workspaces?.mine ?? [],
            next?.threadUuid ?? null,
        );
        workspaceAction.mutate(
            workspace
                ? { kind: 'activate', workspaceUuid: workspace.workspaceUuid }
                : { kind: 'leave' },
        );
    };
    return {
        startNewThread: () => {
            if (stored) setPrevious(stored);
            setStored(null);
            follow(null);
        },
        previousThread:
            previous && agents.some(({ uuid }) => uuid === previous.agentUuid)
                ? previous
                : null,
        /** Swaps the open chat with the previous one, so each button press goes back and forth. */
        returnToPreviousThread: () => {
            setPrevious(stored);
            setStored(previous);
            follow(previous);
        },
    };
};

/** Sends the agent the failed compile of its last save as a hidden prompt, once per compile, while this chat is open and idle. */
export const useCompileFollowUp = ({
    projectUuid,
    agentUuid,
    threadUuid,
    isBusy,
    enableSqlMode,
}: {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    isBusy: boolean;
    enableSqlMode: boolean;
}) => {
    const { data: checkout } = useDraftCheckout(projectUuid);
    const { mutateAsync: claim } = useClaimCompileFollowUp(projectUuid);
    const { mutate: sendMessage } = useCreateAgentThreadMessageMutation(
        projectUuid,
        agentUuid,
        threadUuid,
    );
    const asking = useRef<string | null>(null);
    const compile = checkout?.branchCompile ?? null;
    const failedRequest =
        compile?.status === 'failed' && compile.requestedByAgent
            ? compile.compileRequestUuid
            : null;
    useEffect(() => {
        if (
            isBusy ||
            failedRequest === null ||
            asking.current === failedRequest
        )
            return;
        asking.current = failedRequest;
        claim({ compileRequestUuid: failedRequest, threadUuid })
            .then((followUp) => {
                if (followUp === null) {
                    // Not sendable yet, such as while the agent still answers; asked again once idle.
                    asking.current = null;
                    return;
                }
                sendMessage({
                    prompt: followUp.prompt,
                    hidden: true,
                    enableSqlMode,
                    // Nobody typed this prompt, so any query still needs the person's approval.
                    autoApproveSql: false,
                });
            })
            .catch(() => {
                asking.current = null;
            });
    }, [claim, enableSqlMode, failedRequest, isBusy, sendMessage, threadUuid]);
};
