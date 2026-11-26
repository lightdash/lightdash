import { createContext, useCallback, useContext } from 'react';
import { getAiAgentApiBase } from './aiAgentRouting';

/** Where a chat's threads live when it is not an agent's own; null for an ordinary agent chat. */
export const ChatThreadsUrlContext = createContext<string | null>(null);

export const getStudioChatThreadsUrl = (projectUuid: string) =>
    `/projects/${projectUuid}/semantic-studio/chat/threads`;

/** Resolves the threads endpoint of the surrounding chat, an agent's unless a chat supplies its own. */
export const useChatThreadsUrl = () => {
    const ownThreadsUrl = useContext(ChatThreadsUrlContext);
    return useCallback(
        (projectUuid: string, agentUuid: string | undefined) =>
            ownThreadsUrl ??
            `${getAiAgentApiBase(projectUuid)}/${agentUuid}/threads`,
        [ownThreadsUrl],
    );
};

/** False in a chat with its own endpoints: it has no agent settings, skills or MCP servers to read. */
export const useChatReadsItsAgent = () =>
    useContext(ChatThreadsUrlContext) === null;
