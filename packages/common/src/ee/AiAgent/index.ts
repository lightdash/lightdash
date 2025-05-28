import { z } from 'zod';

export const baseAgentSchema = z.object({
    uuid: z.string(),
    projectUuid: z.string(),
    organizationUuid: z.string(),

    name: z.string(),
    description: z.string(),
    imageUrl: z.string(),

    tags: z.array(z.string()).nullable(),

    integrations: z.array(
        // z.union([
        // TODO: once we add more integrations, we should use union
        z.object({
            type: z.literal('slack'),
            channelId: z.string(),
        }),
        // ]),
    ),

    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),

    instruction: z
        .string()
        .max(
            4096,
            'Custom instruction is too long. Maximum allowed is 4,000 characters.',
        )
        .nullable(),
    provider: z.string(),
    model: z.string(),
});

export type BaseAiAgent = z.infer<typeof baseAgentSchema>;

export type AiAgent = Pick<
    BaseAiAgent,
    | 'uuid'
    | 'projectUuid'
    | 'organizationUuid'
    | 'integrations'
    | 'tags'
    | 'name'
    | 'createdAt'
    | 'updatedAt'
    | 'instruction'
>;

export type AiAgentSummary = Pick<
    AiAgent,
    | 'uuid'
    | 'name'
    | 'integrations'
    | 'tags'
    | 'projectUuid'
    | 'organizationUuid'
    | 'createdAt'
    | 'updatedAt'
    | 'instruction'
>;

export type AiAgentUser = {
    uuid: string;
    name: string;
};

export type AiAgentMessageUser<TUser extends AiAgentUser = AiAgentUser> = {
    role: 'user';
    uuid: string;
    threadUuid: string;
    message: string; // ai_prompt.prompt
    createdAt: string;

    user: TUser;
};

export type AiAgentMessageAssistant = {
    role: 'assistant';
    uuid: string;
    threadUuid: string;
    message: string; // ai_prompt.response
    createdAt: string; // ai_prompt.responded_at

    vizConfigOutput?: object;
    filtersOutput?: object;
    metricQuery?: object;
    humanScore?: number;
};

export type AiAgentMessage<TUser extends AiAgentUser = AiAgentUser> =
    | AiAgentMessageUser<TUser>
    | AiAgentMessageAssistant;

export type AiAgentThreadSummary<TUser extends AiAgentUser = AiAgentUser> = {
    uuid: string;
    agentUuid: string;
    createdAt: string;
    createdFrom: string;
    firstMessage: string;
    user: TUser;
};

export type AiAgentThread<TUser extends AiAgentUser = AiAgentUser> =
    AiAgentThreadSummary<TUser> & {
        messages: AiAgentMessage<TUser>[];
    };

export type ApiAiAgentResponse = {
    status: 'ok';
    results: AiAgent;
};

export type ApiAiAgentSummaryResponse = {
    status: 'ok';
    results: AiAgentSummary[];
};

export type ApiCreateAiAgent = Pick<
    AiAgent,
    'projectUuid' | 'integrations' | 'tags' | 'name' | 'instruction'
>;

export type ApiUpdateAiAgent = Partial<
    Pick<
        AiAgent,
        'projectUuid' | 'integrations' | 'tags' | 'name' | 'instruction'
    >
> & {
    uuid: string;
};

export type ApiCreateAiAgentResponse = {
    status: 'ok';
    results: AiAgent;
};

export type ApiAiAgentThreadSummaryListResponse = {
    status: 'ok';
    results: AiAgentThreadSummary[];
};

export type ApiAiAgentThreadResponse = {
    status: 'ok';
    results: AiAgentThread;
};

export * from './filterExploreByTags';
