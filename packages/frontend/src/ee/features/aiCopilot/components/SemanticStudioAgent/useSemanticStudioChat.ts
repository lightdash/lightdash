import { useLocalStorage } from '@mantine/hooks';
import { useCanEditSemanticLayer } from '../../../../../features/semanticStudio/useSemanticLayerModel';
import { useDefaultAiAgent } from '../Launcher/useDefaultAiAgent';

export type StoredThread = { threadUuid: string; agentUuid: string };

export const useChatOpen = () =>
    useLocalStorage({
        key: 'semantic-studio-agent-open',
        defaultValue: true,
    });

export const useStudioAgent = (projectUuid: string) => {
    const isEnabled = useCanEditSemanticLayer(projectUuid);
    const { agent: defaultAgent, agents } = useDefaultAiAgent(projectUuid);
    const [stored, setStored] = useLocalStorage<StoredThread | null>({
        key: `semantic-studio-agent-thread-${projectUuid}`,
        defaultValue: null,
    });
    // ponytail: one chat back, not a history; list the project's Studio threads if people need more.
    const [previous, setPrevious] = useLocalStorage<StoredThread | null>({
        key: `semantic-studio-agent-previous-thread-${projectUuid}`,
        defaultValue: null,
    });
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
        },
        previousThread:
            previous && agents.some(({ uuid }) => uuid === previous.agentUuid)
                ? previous
                : null,
        /** Swaps the open chat with the previous one, so each button press goes back and forth. */
        returnToPreviousThread: () => {
            setPrevious(stored);
            setStored(previous);
        },
    };
};

/** Whether this project can talk to the agent, and whether it has already started. */
export const useSemanticStudioChat = (projectUuid: string) => {
    const { isEnabled, agent, thread } = useStudioAgent(projectUuid);
    return { isAvailable: isEnabled && !!agent, hasThread: !!thread };
};
