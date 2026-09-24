import { z } from 'zod';
import { agentPath, type Agent } from './agents';
import type { LightdashApi } from './api';

export const threadsPath = (agent: Agent) => `${agentPath(agent)}/threads`;

export const threadPath = (agent: Agent, threadUuid: string) =>
    `${threadsPath(agent)}/${threadUuid}`;

export const threadSummarySchema = z.object({
    uuid: z.string(),
    agentUuid: z.string(),
    firstMessage: z.object({ uuid: z.string(), message: z.string() }),
});

const assistantMessageSchema = z.object({
    role: z.literal('assistant'),
    uuid: z.string(),
    status: z.enum(['idle', 'pending', 'error']),
    message: z.string().nullable(),
    errorMessage: z.string().nullable(),
    toolCalls: z.array(z.looseObject({ toolName: z.string() })),
});

const threadSchema = z.object({
    uuid: z.string(),
    messages: z.array(
        z.discriminatedUnion('role', [
            z.object({ role: z.literal('user'), uuid: z.string() }),
            assistantMessageSchema,
        ]),
    ),
});

export type AssistantMessage = z.output<typeof assistantMessageSchema>;

/** Creates a thread whose first prompt is `prompt`; nothing is answered yet. */
export const createThread = (api: LightdashApi, agent: Agent, prompt: string) =>
    api.post(threadsPath(agent), { prompt }, threadSummarySchema);

/** Non-streaming answer to the thread's latest prompt. */
export const generateAnswer = (
    api: LightdashApi,
    agent: Agent,
    threadUuid: string,
) =>
    api.post(
        `${threadPath(agent, threadUuid)}/generate`,
        {},
        z.object({ response: z.string() }),
    );

export const getThread = (
    api: LightdashApi,
    agent: Agent,
    threadUuid: string,
) => api.get(threadPath(agent, threadUuid), threadSchema);

export const latestAssistantMessage = async (
    api: LightdashApi,
    agent: Agent,
    threadUuid: string,
): Promise<AssistantMessage> => {
    const { messages } = await getThread(api, agent, threadUuid);
    const assistant = messages
        .flatMap((message) => (message.role === 'assistant' ? [message] : []))
        .at(-1);
    if (assistant === undefined) {
        throw new Error(`Thread ${threadUuid} has no assistant message`);
    }
    return assistant;
};
