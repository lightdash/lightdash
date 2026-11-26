import { createContext, useCallback, useContext } from 'react';
import { getAiAgentApiBase } from './aiAgentRouting';

/** Where a chat's threads and artifacts live when it is not an agent's own; null for an ordinary agent chat. */
export const ChatApiBaseContext = createContext<string | null>(null);

export const getStudioChatApiBase = (projectUuid: string) =>
    `/projects/${projectUuid}/semantic-studio/chat`;

export const getStudioChatThreadsUrl = (projectUuid: string) =>
    `${getStudioChatApiBase(projectUuid)}/threads`;

// The surrounding chat's own base, an agent's unless the chat supplies one.
const useChatApiBase = () => {
    const ownBase = useContext(ChatApiBaseContext);
    return useCallback(
        (projectUuid: string, agentUuid: string | undefined) =>
            ownBase ?? `${getAiAgentApiBase(projectUuid)}/${agentUuid}`,
        [ownBase],
    );
};

/** Resolves the threads endpoint of the surrounding chat. */
export const useChatThreadsUrl = () => {
    const getBase = useChatApiBase();
    return useCallback(
        (projectUuid: string, agentUuid: string | undefined) =>
            `${getBase(projectUuid, agentUuid)}/threads`,
        [getBase],
    );
};

/** Resolves the artifacts endpoint of the surrounding chat, for the reads a chat with its own endpoints serves. */
export const useChatArtifactsUrl = () => {
    const getBase = useChatApiBase();
    return useCallback(
        (projectUuid: string, agentUuid: string | undefined) =>
            `${getBase(projectUuid, agentUuid)}/artifacts`,
        [getBase],
    );
};

/** False in a chat with its own endpoints: it has no agent settings, skills or MCP servers to read. */
export const useChatReadsItsAgent = () =>
    useContext(ChatApiBaseContext) === null;
