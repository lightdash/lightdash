import type { AnyType } from '../../types/any';

export type AiThread = {
    aiThreadUuid: string;
    organizationUuid: string;
    projectUuid: string;
    createdAt: Date;
    createdFrom: string;
};

export type CreateSlackThread = {
    organizationUuid: string;
    projectUuid: string;
    createdFrom: 'slack' | 'web_app';
    slackUserId: string;
    slackChannelId: string;
    slackThreadTs: string;
};

export type CreateWebAppThread = {
    organizationUuid: string;
    projectUuid: string;
    userUuid: string;
    createdFrom: 'web_app';
};

export type AiPrompt = {
    organizationUuid: string;
    projectUuid: string;
    promptUuid: string;
    threadUuid: string;
    createdByUserUuid: string;
    prompt: string;
    createdAt: Date;
    response: string;
    filtersOutput: object | null;
    vizConfigOutput: object | null;
    humanScore: number | null;
    metricQuery: object | null;
};

export type SlackPrompt = AiPrompt & {
    response_slack_ts: string;
    slackUserId: string;
    slackChannelId: string;
    promptSlackTs: string;
    slackThreadTs: string;
};

export type AiWebAppPrompt = AiPrompt & {
    userUuid: string;
};

export const isSlackPrompt = (prompt: AiPrompt): prompt is SlackPrompt =>
    'slackUserId' in prompt;

export type CreateSlackPrompt = {
    threadUuid: string;
    createdByUserUuid: string;
    prompt: string;
    slackUserId: string;
    slackChannelId: string;
    promptSlackTs: string;
};

export type CreateWebAppPrompt = {
    threadUuid: string;
    createdByUserUuid: string;
    prompt: string;
};

export type UpdateSlackResponse = {
    promptUuid: string;
    response?: string;
    filtersOutput?: object | null;
    vizConfigOutput?: object | null;
    humanScore?: number | null;
    metricQuery?: object | null;
};

export type UpdateWebAppResponse = {
    promptUuid: string;
    response: string;
    filtersOutput?: object | null;
    vizConfigOutput?: object | null;
    humanScore?: number | null;
    metricQuery?: object | null;
};

export type UpdateSlackResponseTs = {
    promptUuid: string;
    responseSlackTs: string;
};

export type SlackPromptJobPayload = {
    slackPromptUuid: string;
};

export enum AiChatAgents {
    HUMAN = 'human',
    AI = 'ai',
}

export type AiChatMessage = {
    agent: AiChatAgents;
    message: string;
};

export type AiConversation = {
    threadUuid: string;
    createdAt: string | Date;
    createdFrom: string; // TODO: should be enum. slack | web | etc...
    firstMessage: string;
    user: {
        uuid: string;
        name: string;
    };
};

export type ApiAiConversations = {
    status: 'ok';
    results: AiConversation[];
};

type AiConversationMessageIncomplete = {
    promptUuid: string;
    message: string;
    createdAt: string | Date;
    user: {
        uuid: string;
        name: string;
    };
};

type AiConversationComplete = AiConversationMessageIncomplete & {
    response: string;
    respondedAt: string | Date;
    vizConfigOutput?: object;
    filtersOutput?: object;
    metricQuery?: object;
    humanScore?: number;
};

export type AiConversationMessage =
    | AiConversationMessageIncomplete
    | AiConversationComplete;

export type ApiAiConversationMessages = {
    status: 'ok';
    results: AiConversationMessage[];
};

export type ApiAiConversationResponse = {
    status: 'ok';
    results: {
        prompt: AiWebAppPrompt;
        rows: Record<string, AnyType>[] | undefined;
    };
};

export const isAiConversationMessageComplete = (
    message: AiConversationMessage,
): message is AiConversationComplete =>
    'response' in message && 'respondedAt' in message;
