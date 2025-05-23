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

    instructions: z.string().nullable(),
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
>;

export type AiAgentMessage =
    | {
          role: 'user';
          uuid: string;
          threadUuid: string;
          message: string; // ai_prompt.prompt
          createdAt: string;

          user: {
              uuid: string;
              name: string;
          };
      }
    | {
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

export type AiAgentThreadSummary = {
    uuid: string;
    agentUuid: string;
    createdAt: string;
    createdFrom: string;
    firstMessage: string;
    user: {
        uuid: string;
        name: string;
    };
};

export type AiAgentThread = AiAgentThreadSummary & {
    messages: AiAgentMessage[];
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
    'projectUuid' | 'integrations' | 'tags' | 'name'
>;

export type ApiUpdateAiAgent = {
    uuid: AiAgent['uuid'];
    projectUuid?: AiAgent['projectUuid'];
    name?: AiAgent['name'];
    tags?: AiAgent['tags'];
    integrations?: AiAgent['integrations'];
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
