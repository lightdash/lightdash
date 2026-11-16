import { useLocalStorage } from '@mantine/hooks';
import { useCanEditSemanticLayer } from '../../../../../features/semanticStudio/useSemanticLayerModel';
import {
    useActiveStudioWorkspace,
    useStudioWorkspaceAction,
    useStudioWorkspaces,
} from '../../../../../features/semanticStudio/useStudioWorkspaces';
import { useDefaultAiAgent } from '../Launcher/useDefaultAiAgent';

export type StoredThread = { threadUuid: string; agentUuid: string };

export const useChatOpen = () =>
    useLocalStorage({
        key: 'semantic-studio-agent-open',
        defaultValue: true,
    });

/** The chat this browser has open; it follows the active workspace, see useSyncStudioWorkspace. */
export const useStoredStudioThread = (projectUuid: string) =>
    useLocalStorage<StoredThread | null>({
        key: `semantic-studio-agent-thread-${projectUuid}`,
        defaultValue: null,
    });

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
    const isEnabled = useCanEditSemanticLayer(projectUuid);
    const { agent: defaultAgent, agents } = useDefaultAiAgent(projectUuid);
    const [stored, setStored] = useStoredStudioThread(projectUuid);
    // ponytail: one chat back, not a history; the workspaces list holds the rest.
    const [previous, setPrevious] = useLocalStorage<StoredThread | null>({
        key: `semantic-studio-agent-previous-thread-${projectUuid}`,
        defaultValue: null,
    });
    const { data: workspaces } = useStudioWorkspaces(projectUuid);
    const workspaceAction = useStudioWorkspaceAction(projectUuid);
    // Switching chats switches workspaces: the one you talk in is the one your changes go to.
    const follow = (next: StoredThread | null) => {
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
        isEnabled,
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

/** Whether this project can talk to the agent, and whether it has already started. */
export const useSemanticStudioChat = (projectUuid: string) => {
    const { isEnabled, agent, thread } = useStudioAgent(projectUuid);
    return { isAvailable: isEnabled && !!agent, hasThread: !!thread };
};
