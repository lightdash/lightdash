import { AsyncLocalStorage } from 'async_hooks';

/** Identifiers stamped on every log line written during an AI agent turn. */
export type AiAgentLogContext = {
    organizationUuid: string;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    promptUuid: string;
    toolCallId: string | null;
    model: string;
    serverVersion: string;
    threadUrl: string;
};

const storage = new AsyncLocalStorage<AiAgentLogContext>();

export const runWithAiAgentLogContext = <T>(
    context: AiAgentLogContext,
    fn: () => T,
): T => storage.run(context, fn);

export const getAiAgentLogContext = (): AiAgentLogContext | null =>
    storage.getStore() ?? null;
