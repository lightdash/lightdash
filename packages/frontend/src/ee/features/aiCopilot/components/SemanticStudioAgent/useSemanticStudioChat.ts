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
    const storedAgent = agents.find(({ uuid }) => uuid === stored?.agentUuid);
    return {
        isEnabled,
        agent: storedAgent ?? defaultAgent ?? agents.at(0),
        thread:
            storedAgent && stored
                ? { agent: storedAgent, threadUuid: stored.threadUuid }
                : null,
        setStored,
    };
};

/** Whether this project can talk to the agent, and whether it has already started. */
export const useSemanticStudioChat = (projectUuid: string) => {
    const { isEnabled, agent, thread } = useStudioAgent(projectUuid);
    return { isAvailable: isEnabled && !!agent, hasThread: !!thread };
};
