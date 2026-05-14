import { type DateZoom } from '../../types/api/paginatedQuery';
import { type DashboardFilters } from '../../types/filter';
import { type ParametersValuesMap } from '../../types/parameters';
import { type ChartKind } from '../../types/savedCharts';
import { type TraceTaskBase } from '../../types/scheduler';

/**
 * Runtime state captured at pin time for a chart context. When a user pins a
 * chart from a dashboard view, these are the dashboard-level overrides that
 * were applied to the chart on screen at that moment.
 */
export type AiChartRuntimeOverrides = {
    dashboardFilters?: DashboardFilters;
    dashboardParameters?: ParametersValuesMap;
    dateZoom?: DateZoom;
};

export type AiThread = {
    aiThreadUuid: string;
    organizationUuid: string;
    projectUuid: string;
    createdAt: Date;
    createdFrom: string;
    agentUuid: string | null;
};

export type CreateSlackThread = {
    organizationUuid: string;
    projectUuid: string;
    createdFrom: 'slack' | 'web_app';
    slackUserId: string;
    slackChannelId: string;
    slackThreadTs: string;
    agentUuid: string | null;
};

export type CreateWebAppThread = {
    organizationUuid: string;
    projectUuid: string;
    userUuid: string;
    createdFrom: 'web_app' | 'evals';
    agentUuid: string | null;
};

export type AiPrompt = {
    organizationUuid: string;
    projectUuid: string;
    agentUuid: string | null;
    promptUuid: string;
    threadUuid: string;
    createdByUserUuid: string;
    prompt: string;
    createdAt: Date;
    response: string | null;
    errorMessage: string | null;
    humanScore: number | null;
    modelConfig: {
        modelName: string;
        modelProvider: string;
        reasoning?: boolean;
    } | null;
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

export type AiPromptContextItemInput =
    | {
          type: 'chart';
          chartUuid: string;
          runtimeOverrides?: AiChartRuntimeOverrides;
      }
    | { type: 'dashboard'; dashboardUuid: string };

export type AiPromptContextInput = AiPromptContextItemInput[];

export type AiPromptContextItem =
    | {
          type: 'chart';
          chartUuid: string;
          pinnedVersionUuid: string | null;
          displayName: string | null;
          runtimeOverrides: AiChartRuntimeOverrides | null;
          chartKind: ChartKind | null;
      }
    | {
          type: 'dashboard';
          dashboardUuid: string;
          pinnedVersionUuid: string | null;
          displayName: string | null;
      };

export type AiPromptContext = AiPromptContextItem[];

export type CreateWebAppPrompt = {
    threadUuid: string;
    createdByUserUuid: string;
    prompt: string;
    context?: AiPromptContextInput;
    modelConfig?: {
        modelName: string;
        modelProvider: string;
        reasoning?: boolean;
    };
};

export type UpdateSlackResponse = {
    promptUuid: string;
    response?: string;
    errorMessage?: string;
    humanScore?: number | null;
};

export type UpdateWebAppResponse = {
    promptUuid: string;
    response?: string;
    errorMessage?: string;
    humanScore?: number | null;
};

export type UpdateSlackResponseTs = {
    promptUuid: string;
    responseSlackTs: string;
};

export type SlackPromptJobPayload = TraceTaskBase & {
    slackPromptUuid: string;
};

export type AiAgentEvalRunJobPayload = TraceTaskBase & {
    evalRunResultUuid: string;
    evalRunUuid: string;
    agentUuid: string;
    threadUuid: string;
};

export type EmbedArtifactVersionJobPayload = TraceTaskBase & {
    artifactVersionUuid: string;
    title: string | null;
    description: string | null;
};

export type GenerateArtifactQuestionJobPayload = TraceTaskBase & {
    artifactVersionUuid: string;
    title: string | null;
    description: string | null;
};

export type CloneThread = {
    sourceThreadUuid: string;
    sourcePromptUuid: string;
    targetUserUuid: string;
    createdFrom?: 'web_app' | 'evals';
};
