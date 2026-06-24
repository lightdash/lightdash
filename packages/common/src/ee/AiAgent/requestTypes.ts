import { type DateZoom } from '../../types/api/paginatedQuery';
import { type DashboardFilters } from '../../types/filter';
import { type PullRequestProvider } from '../../types/gitIntegration';
import { type ParametersValuesMap } from '../../types/parameters';
import { type ChartKind } from '../../types/savedCharts';
import { type TraceTaskBase } from '../../types/scheduler';
import {
    type AiAgentEvidenceExcerpt,
    type AiAgentJudgeProjectContextEntry,
    type AiAgentRecommendation,
    type AiAgentReviewItemPrState,
    type AiAgentReviewRemediationStatus,
    type AiAgentRootCause,
} from './aiAgentReviewClassifierTypes';

export type AiAgentModelConfig = {
    modelName: string;
    modelProvider: string;
    reasoning?: boolean;
};

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

export type AiPromptTokenUsage = {
    totalTokens: number;
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
    createdFrom: 'web_app' | 'evals' | 'scheduler';
    agentUuid: string | null;
    embedSpaceUuid?: string | null;
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
    modelConfig: AiAgentModelConfig | null;
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
    modelConfig?: AiAgentModelConfig;
    slackUserId: string;
    slackChannelId: string;
    promptSlackTs: string;
};

export type AiPromptContextItemInput =
    | {
          type: 'chart';
          chartUuid: string;
          chartSlug?: string | null;
          runtimeOverrides?: AiChartRuntimeOverrides;
      }
    | {
          type: 'dashboard';
          dashboardUuid: string;
          dashboardSlug?: string | null;
      }
    | {
          type: 'thread';
          threadUuid: string;
          // The turn the reference points at (e.g. a flagged prompt).
          promptUuid?: string | null;
      }
    | {
          // A dbt source file the user @-mentioned. `path` is relative to the
          // dbt sub-folder (as the project-files endpoint returns it); the
          // agent's repo filesystem mounts that folder at `/dbt`.
          type: 'file';
          path: string;
      }
    | {
          // A GitHub repository the user @-mentioned, as `owner/repo`. The
          // agent's repo filesystem mounts it at `/owner/repo`.
          type: 'repository';
          fullName: string;
      }
    | {
          // The review-remediation pull request applying the proposed change.
          type: 'pull_request';
          prUrl: string;
      }
    | {
          // The change a writeback applies, resolved from the review finding.
          // System-only: seeded by the remediation flow, never user-attached.
          type: 'proposed_change';
          fingerprint: string;
      }
    | {
          // The review finding being remediated. System-only.
          type: 'review_finding';
          fingerprint: string;
      }
    | {
          // The preview project where a semantic-layer fix can be tested.
          type: 'preview_environment';
          previewProjectUuid: string;
      };

export type AiPromptContextInput = AiPromptContextItemInput[];

// The concrete change a writeback applies — one card concept, two payloads.
export type AiPromptProposedChangePayload =
    | { changeKind: 'project_context'; entry: AiAgentJudgeProjectContextEntry }
    | { changeKind: 'semantic_layer'; recommendation: AiAgentRecommendation };

export type AiPromptContextItem =
    | {
          type: 'chart';
          chartUuid: string;
          chartSlug: string | null;
          pinnedVersionUuid: string | null;
          displayName: string | null;
          runtimeOverrides: AiChartRuntimeOverrides | null;
          chartKind: ChartKind | null;
      }
    | {
          type: 'dashboard';
          dashboardUuid: string;
          dashboardSlug: string | null;
          pinnedVersionUuid: string | null;
          displayName: string | null;
      }
    | {
          type: 'thread';
          threadUuid: string;
          promptUuid: string | null;
          displayName: string | null;
      }
    | {
          // Resolved file reference — a passthrough of the input (the path is
          // self-contained, there is nothing to look up server-side).
          type: 'file';
          path: string;
      }
    | {
          // Resolved repository reference — a passthrough of the input.
          type: 'repository';
          fullName: string;
      }
    | {
          type: 'pull_request';
          prUrl: string;
          prNumber: number | null;
          provider: PullRequestProvider | null;
          status: AiAgentReviewItemPrState | null;
          title: string | null;
      }
    | {
          type: 'proposed_change';
          fingerprint: string;
          payload: AiPromptProposedChangePayload;
      }
    | {
          type: 'review_finding';
          fingerprint: string;
          title: string;
          rootCause: AiAgentRootCause;
          findingCount: number;
          evidenceExcerpts: AiAgentEvidenceExcerpt[];
      }
    | {
          type: 'preview_environment';
          previewProjectUuid: string;
          previewThreadUuid: string | null;
          status: AiAgentReviewRemediationStatus | null;
          projectName: string | null;
      };

export type AiPromptContext = AiPromptContextItem[];

export type CreateWebAppPrompt = {
    threadUuid: string;
    createdByUserUuid: string;
    prompt: string;
    context?: AiPromptContextInput;
    modelConfig?: AiAgentModelConfig;
    /** Inject as a hidden turn (agent responds, UI hides the user bubble). */
    hidden?: boolean;
};

export type UpdateSlackResponse = {
    promptUuid: string;
    response?: string;
    errorMessage?: string;
    humanScore?: number | null;
    tokenUsage?: AiPromptTokenUsage | null;
};

export type UpdateWebAppResponse = {
    promptUuid: string;
    response?: string;
    errorMessage?: string;
    humanScore?: number | null;
    tokenUsage?: AiPromptTokenUsage | null;
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

export type AiAgentReviewClassifierEventType =
    | 'response_saved'
    | 'feedback_changed';

export type AiAgentReviewClassifierJobPayload = TraceTaskBase & {
    eventType: AiAgentReviewClassifierEventType;
    organizationUuid: string;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    promptUuid: string;
};

export type AiAgentReviewWritebackJobPayload = TraceTaskBase & {
    fingerprint: string;
    organizationUuid: string;
    projectUuid: string;
    remediationUuid?: string;
};

export type AiAgentReviewRemediationPreviewJobPayload = TraceTaskBase & {
    fingerprint: string;
    remediationUuid: string;
    prUrl: string;
    startedAt: number;
};

export type AiAgentReviewRemediationCompileJobPayload = TraceTaskBase & {
    fingerprint: string;
    remediationUuid: string;
    previewProjectUuid: string;
    compileJobUuid: string;
    startedAt: number;
};

export type AiAgentReviewRemediationRunJobPayload = TraceTaskBase & {
    fingerprint: string;
    remediationUuid: string;
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
