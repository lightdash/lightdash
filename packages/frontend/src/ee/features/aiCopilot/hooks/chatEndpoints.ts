import { createContext, useCallback, useContext } from 'react';
import { getAiAgentApiBase } from './aiAgentRouting';

/** What a chat that is not an agent's own brings with it. */
export type ChatOwnEndpoints = {
    /** Where its threads and artifacts live. */
    apiBase: string;
    /** The agent the chat already holds and never asks for; null until it has it. */
    ownAgentUuid: string | null;
};

/** Null for an ordinary agent chat. */
export const ChatOwnEndpointsContext = createContext<ChatOwnEndpoints | null>(
    null,
);

export const getStudioChatApiBase = (projectUuid: string) =>
    `/projects/${projectUuid}/semantic-studio/chat`;

export const getStudioChatThreadsUrl = (projectUuid: string) =>
    `${getStudioChatApiBase(projectUuid)}/threads`;

// The surrounding chat's own base, an agent's unless the chat supplies one.
const useChatApiBase = () => {
    const ownBase = useContext(ChatOwnEndpointsContext)?.apiBase;
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

/** False in a chat with its own endpoints: it has no skills, MCP servers or deep research to read. */
export const useChatReadsItsAgent = () =>
    useContext(ChatOwnEndpointsContext) === null;

/** Whether to ask for this agent: always in an agent's chat, and elsewhere unless the chat already holds it. */
export const useChatReadsAgent = (agentUuid: string | undefined) => {
    const own = useContext(ChatOwnEndpointsContext);
    return own === null || agentUuid !== own.ownAgentUuid;
};
