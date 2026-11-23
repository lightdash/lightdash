import { FeatureFlags } from '@lightdash/common';
import { useLocalStorage } from '@mantine/hooks';
import { useCallback, useEffect, useRef } from 'react';
import { getAiAccessRefusal } from '../../../../../features/aiAccess/errors';
import {
    useStoredStudioThread,
    type StoredThread,
} from '../../../../../features/semanticStudio/studioChange';
import {
    useCanEditSemanticLayer,
    useClaimCompileFollowUp,
    useDraftCheckout,
    useKeepsSemanticLayerDraft,
} from '../../../../../features/semanticStudio/useSemanticLayerModel';
import {
    useActiveStudioWorkspace,
    useStudioWorkspaceAction,
    useStudioWorkspaces,
} from '../../../../../features/semanticStudio/useStudioWorkspaces';
import useToaster from '../../../../../hooks/toaster/useToaster';
import { useServerFeatureFlag } from '../../../../../hooks/useServerOrClientFeatureFlag';
import {
    useAiAgentThread,
    useCreateAgentThreadMessageMutation,
} from '../../hooks/useProjectAiAgents';
import { useDefaultAiAgent } from '../Launcher/useDefaultAiAgent';

/** Asks for the project's agents with the page, so the chat loads alongside the explores and not after them. */
export const usePrefetchStudioAgent = (projectUuid: string | undefined) => {
    useDefaultAiAgent(projectUuid);
};

/** Whether the chat is open on the change you are on; closing it is remembered per change. */
export const useChatOpen = (projectUuid: string) => {
    const [stored] = useStoredStudioThread(projectUuid);
    const [closed, setClosed] = useLocalStorage<string[]>({
        key: 'semantic-studio-chat-closed',
        defaultValue: [],
        getInitialValueInEffect: false,
    });
    const newChat = `new-${projectUuid}`;
    const change = stored?.threadUuid ?? newChat;
    const setIsOpen = useCallback(
        (isOpen: boolean) =>
            setClosed((current) => {
                // Opening also reopens a blank new change, which starting one asks for before it has a thread.
                const others = current.filter(
                    (key) => key !== change && !(isOpen && key === newChat),
                );
                return isOpen ? others : [...others, change].slice(-50);
            }),
        [change, newChat, setClosed],
    );
    return [!closed.includes(change), setIsOpen] as const;
};

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
            if (error.name === 'AiAgentNotFoundError') {
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

export const useStudioAgent = (projectUuid: string) => {
    const flag = useServerFeatureFlag(FeatureFlags.SemanticStudioEditing);
    const keepsDraft = useKeepsSemanticLayerDraft(projectUuid);
    const canEdit = useCanEditSemanticLayer(projectUuid);
    const isEnabled = flag.data?.enabled === true && canEdit;
    const {
        agent: defaultAgent,
        agents,
        isLoadingAgents,
    } = useDefaultAiAgent(projectUuid);
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
        if (keepsDraft) return;
        const workspace = next
            ? workspaces?.mine.find(
                  ({ threadUuid }) => threadUuid === next.threadUuid,
              )
            : undefined;
        workspaceAction.mutate(
            workspace
                ? { kind: 'activate', workspaceUuid: workspace.workspaceUuid }
                : { kind: 'leave' },
        );
    };
    const storedAgent = agents.find(({ uuid }) => uuid === stored?.agentUuid);
    return {
        isLoadingAgents,
        isEnabled,
        hasAgents: agents.length > 0,
        agent: storedAgent ?? defaultAgent ?? agents.at(0),
        thread:
            storedAgent && stored
                ? { agent: storedAgent, threadUuid: stored.threadUuid }
                : null,
        setStored,
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
