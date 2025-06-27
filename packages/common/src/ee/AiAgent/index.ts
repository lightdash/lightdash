import { z } from 'zod';
import type {
    AnyType,
    ApiExecuteAsyncMetricQueryResults,
    ApiSuccess,
    ApiSuccessEmpty,
    CacheMetadata,
    ItemsMap,
    MetricQuery,
} from '../..';

/**
 * Supported AI visualization chart types
 */
// TODO: Think better naming for this or sharing similar names with explorer
export enum AiChartType {
    TIME_SERIES_CHART = 'time_series_chart',
    VERTICAL_BAR_CHART = 'vertical_bar_chart',
    CSV = 'csv', // TABLE -  this is also table
}

export type AiMetricQuery = Pick<
    MetricQuery,
    'metrics' | 'dimensions' | 'sorts' | 'limit' | 'exploreName' | 'filters'
>;

export const baseAgentSchema = z.object({
    uuid: z.string(),
    projectUuid: z.string(),
    organizationUuid: z.string(),

    name: z.string(),
    description: z.string(),
    imageUrl: z.string().url().nullable(),

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
    | 'imageUrl'
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
    | 'imageUrl'
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

    // ai_prompt.response
    message: string | null;
    // ai_prompt.responded_at but this can not be null because
    // we check for null before creating the agent message
    createdAt: string;

    vizConfigOutput: object | null;
    filtersOutput: object | null;
    metricQuery: object | null;
    humanScore: number | null;

    toolCalls: AiAgentToolCall[];
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
    | 'projectUuid'
    | 'integrations'
    | 'tags'
    | 'name'
    | 'instruction'
    | 'imageUrl'
>;

export type ApiUpdateAiAgent = Partial<
    Pick<
        AiAgent,
        | 'projectUuid'
        | 'integrations'
        | 'tags'
        | 'name'
        | 'instruction'
        | 'imageUrl'
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

export type ApiAiAgentThreadCreateRequest = {
    prompt?: string;
};

export type ApiAiAgentThreadCreateResponse = ApiSuccess<AiAgentThreadSummary>;

export type ApiAiAgentThreadMessageCreateRequest = {
    prompt: string;
};

export type ApiAiAgentThreadMessageCreateResponse = ApiSuccess<
    AiAgentMessageUser<AiAgentUser>
>;

export type ApiAiAgentStartThreadResponse = {
    status: 'ok';
    results: {
        jobId: string;
        threadUuid: string;
    };
};

export type ApiAiAgentThreadMessageViz = {
    type: AiChartType;
    metricQuery: AiMetricQuery;
    chartOptions?: object;
    results: {
        rows: Record<string, AnyType>[];
        cacheMetadata: CacheMetadata;
        fields: ItemsMap;
    };
};

export type ApiAiAgentThreadMessageVizResponse = {
    status: 'ok';
    results: ApiAiAgentThreadMessageViz;
};

export type AiVizMetadata = {
    title: string | null;
    description: string | null;
};

export type ApiAiAgentThreadMessageVizQuery = {
    type: AiChartType;
    query: ApiExecuteAsyncMetricQueryResults;
    metadata: AiVizMetadata;
};

export type ApiAiAgentThreadMessageVizQueryResponse = {
    status: 'ok';
    results: ApiAiAgentThreadMessageVizQuery;
};

export * from './filterExploreByTags';

export type AiAgentUserPreferences = {
    defaultAgentUuid: AiAgent['uuid'];
};

export type ApiGetUserAgentPreferencesResponse =
    | ApiSuccess<AiAgentUserPreferences>
    | ApiSuccessEmpty;

export type ApiUpdateUserAgentPreferences = AiAgentUserPreferences;

export type ApiUpdateUserAgentPreferencesResponse = ApiSuccessEmpty;

export type AiAgentToolCall = {
    uuid: string;
    promptUuid: string;
    toolCallId: string;
    createdAt: Date;
    // TODO: tsoa does not support zod infer schemas - https://github.com/lukeautry/tsoa/issues/1256
    toolName: string; // ToolName zod enum
    toolArgs: object;
};
