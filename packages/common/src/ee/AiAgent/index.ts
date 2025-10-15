import { z } from 'zod';
import type {
    AnyType,
    ApiExecuteAsyncMetricQueryResults,
    ApiSuccess,
    ApiSuccessEmpty,
    CacheMetadata,
    ItemsMap,
    KnexPaginatedData,
    ToolDashboardArgs,
    ToolName,
    ToolProposeChangeOutput,
    ToolRunQueryArgs,
    ToolTableVizArgs,
    ToolTimeSeriesArgs,
    ToolVerticalBarArgs,
} from '../..';
import { type AgentToolOutput } from './schemas';
import { type AiMetricQuery, type AiResultType } from './types';

export * from './adminTypes';
export * from './constants';
export * from './filterExploreByTags';
export * from './followUpTools';
export * from './requestTypes';
export * from './schemas';
export * from './types';
export * from './utils';
export * from './utils/chartConfigUtils';
export * from './validators';

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
            8192, // 8kb
            'Custom instruction is too long. Maximum allowed is 8,100 characters.',
        )
        .nullable(),
    provider: z.string(),
    model: z.string(),
    groupAccess: z.array(z.string()),
    userAccess: z.array(z.string()),
    enableDataAccess: z.boolean(),
    enableSelfImprovement: z.boolean(),
    version: z.number(),
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
    | 'groupAccess'
    | 'userAccess'
    | 'enableDataAccess'
    | 'enableSelfImprovement'
    | 'version'
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
    | 'groupAccess'
    | 'userAccess'
    | 'enableDataAccess'
    | 'enableSelfImprovement'
    | 'version'
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

export type AiAgentMessageAssistantArtifact = Pick<
    AiArtifact,
    | 'artifactUuid'
    | 'versionNumber'
    | 'versionUuid'
    | 'title'
    | 'description'
    | 'artifactType'
>;

export type AiAgentMessageAssistant = {
    role: 'assistant';
    uuid: string;
    threadUuid: string;

    // ai_prompt.response
    message: string | null;
    // ai_prompt.responded_at but this can not be null because
    // we check for null before creating the agent message
    createdAt: string;

    humanScore: number | null;

    toolCalls: AiAgentToolCall[];
    toolResults: AiAgentToolResult[];
    savedQueryUuid: string | null;

    artifacts: AiAgentMessageAssistantArtifact[] | null;
};

export type AiAgentMessage<TUser extends AiAgentUser = AiAgentUser> =
    | AiAgentMessageUser<TUser>
    | AiAgentMessageAssistant;

export type AiAgentThreadSummary<TUser extends AiAgentUser = AiAgentUser> = {
    uuid: string;
    agentUuid: string;
    createdAt: string;
    createdFrom: string;
    title: string | null;
    titleGeneratedAt: string | null;
    firstMessage: {
        uuid: string;
        message: string;
    };
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
    | 'groupAccess'
    | 'userAccess'
    | 'enableDataAccess'
    | 'enableSelfImprovement'
    | 'version'
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
        | 'groupAccess'
        | 'userAccess'
        | 'enableDataAccess'
        | 'enableSelfImprovement'
        | 'version'
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

export type ApiAiAgentThreadGenerateResponse = {
    status: 'ok';
    results: {
        response: string;
    };
};

export type ApiAiAgentThreadGenerateTitleResponse = {
    status: 'ok';
    results: {
        title: string;
    };
};

export type ApiAiAgentThreadMessageViz = {
    type: AiResultType;
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
    type: AiResultType;
    query: ApiExecuteAsyncMetricQueryResults;
    metadata: AiVizMetadata;
};

export type ApiAiAgentThreadMessageVizQueryResponse = {
    status: 'ok';
    results: ApiAiAgentThreadMessageVizQuery;
};

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

export type AiAgentToolResult = {
    uuid: string;
    promptUuid: string;
    result: string;
    createdAt: Date;
    toolCallId: string;
} & (
    | {
          toolName: 'proposeChange';
          metadata: ToolProposeChangeOutput['metadata'];
      }
    | {
          toolName: Exclude<ToolName, 'proposeChange'>;
          metadata: AgentToolOutput['metadata'];
      }
);

export type AiAgentExploreAccessSummary = {
    exploreName: string;
    joinedTables: string[];
    dimensions: string[];
    metrics: string[];
};

export type ApiAiAgentExploreAccessSummaryResponse = ApiSuccess<
    AiAgentExploreAccessSummary[]
>;

export type AiArtifact = {
    artifactUuid: string;
    threadUuid: string;
    promptUuid: string | null;
    artifactType: 'chart' | 'dashboard';
    savedQueryUuid: string | null;
    savedDashboardUuid: string | null;
    createdAt: Date;
    versionNumber: number;
    versionUuid: string;
    title: string | null;
    description: string | null;
    // We store raw tool calls
    chartConfig:
        | ToolTableVizArgs
        | ToolTimeSeriesArgs
        | ToolVerticalBarArgs
        | ToolRunQueryArgs
        | null;
    dashboardConfig: ToolDashboardArgs | null;
    versionCreatedAt: Date;
};

export type AiArtifactTSOACompat = Omit<
    AiArtifact,
    'chartConfig' | 'dashboardConfig'
> & {
    chartConfig: Record<string, unknown> | null;
    dashboardConfig: Record<string, unknown> | null;
};

export type ApiAiAgentArtifactResponse = ApiSuccess<AiArtifact>;
export type ApiAiAgentArtifactResponseTSOACompat =
    ApiSuccess<AiArtifactTSOACompat>;

export type AiAgentEvaluationPrompt = {
    evalPromptUuid: string;
    createdAt: Date;
} & (
    | {
          type: 'string';
          prompt: string;
      }
    | {
          type: 'thread';
          promptUuid: string;
          threadUuid: string;
      }
);

export type AiAgentEvaluation = {
    evalUuid: string;
    agentUuid: string;
    title: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
    prompts: AiAgentEvaluationPrompt[];
};

export type AiAgentEvaluationSummary = Pick<
    AiAgentEvaluation,
    | 'evalUuid'
    | 'agentUuid'
    | 'title'
    | 'description'
    | 'createdAt'
    | 'updatedAt'
>;

export type AiAgentEvaluationRunSummary = {
    runUuid: string;
    evalUuid: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    completedAt: Date | null;
    createdAt: Date;
};

export type AiAgentEvaluationRun = AiAgentEvaluationRunSummary & {
    results: AiAgentEvaluationRunResult[];
};

export type AiAgentEvaluationRunResult = {
    resultUuid: string;
    evalPromptUuid: string | null;
    threadUuid: string | null;
    status: 'pending' | 'running' | 'completed' | 'failed';
    errorMessage: string | null;
    completedAt: Date | null;
    createdAt: Date;
};

/**
 * Represents a prompt for evaluation that can be either:
 * - A string containing the prompt text directly
 * - An object referencing an existing prompt and thread by their UUIDs
 */
export type CreateEvaluationPrompt =
    | string
    | {
          promptUuid: string;
          threadUuid: string;
      };

export type ApiCreateEvaluationRequest = {
    title: string;
    description?: string;
    prompts: CreateEvaluationPrompt[];
};

export type ApiUpdateEvaluationRequest = {
    title?: string;
    description?: string;
    prompts?: CreateEvaluationPrompt[];
};

export type ApiAppendEvaluationRequest = {
    prompts: CreateEvaluationPrompt[];
};

// API Response types
export type ApiAiAgentEvaluationSummaryListResponse = ApiSuccess<
    AiAgentEvaluationSummary[]
>;
export type ApiAiAgentEvaluationResponse = ApiSuccess<AiAgentEvaluation>;
export type ApiAiAgentEvaluationRunResponse =
    ApiSuccess<AiAgentEvaluationRunSummary>;
export type ApiAiAgentEvaluationRunSummaryListResponse = ApiSuccess<
    KnexPaginatedData<{
        runs: AiAgentEvaluationRunSummary[];
    }>
>;
export type ApiAiAgentEvaluationRunResultsResponse =
    ApiSuccess<AiAgentEvaluationRun>;

export type ApiCreateEvaluationResponse = ApiSuccess<
    Pick<AiAgentEvaluation, 'evalUuid'>
>;
export type ApiUpdateEvaluationResponse = ApiSuccess<AiAgentEvaluation>;

export type ApiCloneThreadResponse = ApiSuccess<AiAgentThreadSummary>;

export type ApiAppendInstructionRequest = {
    instruction: string;
};

export type ApiAppendInstructionResponse = ApiSuccess<{
    updatedInstruction: string;
}>;

export type ApiRevertChangeRequest = {
    changeUuid: string;
};

export type ApiRevertChangeResponse = ApiSuccessEmpty;
