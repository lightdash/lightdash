import { z } from 'zod';
import type { ApiSuccess } from '../../types/api/success';
import type { MetricQuery } from '../../types/metricQuery';
import type { QueryHistoryStatus } from '../../types/queryHistory';
import type { AiAgentDocumentStructuredSummary } from './documentTypes';
import type { AiAgentReviewClassifierEventType } from './requestTypes';

export type AiAgentReviewClassifierSubject = {
    type: 'turn_review';
    assistantPromptUuid: string;
    threadUuid: string;
    agentUuid: string;
    projectUuid: string;
    organizationUuid: string;
};

export type AiAgentInteractionSource = 'app' | 'slack';

export type AiAgentTurnSignalSourceRef =
    | {
          source: 'app';
          threadUuid: string;
          promptUuid: string;
          appUrl: string | null;
      }
    | {
          source: 'slack';
          channelId: string;
          threadTs: string | null;
          messageTs: string;
          slackPermalink: string | null;
      };

export type AiAgentTurnSignal =
    | 'normal_refinement'
    | 'implicit_correction'
    | 'explicit_dispute'
    | 'retry_after_failure'
    | 'output_shape_correction'
    | 'new_question'
    | 'acceptance_or_continuation'
    | 'product_capability_request'
    | 'human_intervention'
    | 'ambiguous';

export type AiAgentImplicitSignalSource =
    | 'next_user_correction'
    | 'next_user_dispute'
    | 'next_user_retry'
    | 'output_shape_correction'
    | 'tool_error'
    | 'assistant_no_answer'
    | 'product_capability_request'
    | 'human_intervention';

export type AiAgentReviewClassifierConfidence = 'low' | 'medium' | 'high';

export type AiAgentRootCause =
    | 'semantic_layer'
    | 'project_context'
    | 'agent_configuration'
    | 'data_gap'
    | 'product_capability'
    | 'runtime_reliability'
    | 'feedback_quality'
    | 'not_a_failure'
    | 'ambiguous';

export type AiAgentFixTarget =
    | 'semantic_yaml_patch'
    | 'project_context_rule'
    | 'agent_configuration_change'
    | 'dbt_modeling_ticket'
    | 'semantic_layer_ticket'
    | 'product_capability_ticket'
    | 'runtime_reliability_ticket'
    | 'feedback_needed'
    | 'no_action';

export type AiAgentConfigurationSetting =
    | 'instructions'
    | 'knowledge_documents'
    | 'data_access'
    | 'self_improvement'
    | 'sql_mode'
    | 'mcp_servers'
    | 'explore_tags'
    | 'space_access'
    | 'user_or_group_access'
    | 'unknown';

export type AiAgentAvailableCapability =
    | 'semantic_query'
    | 'chart_generation'
    | 'dashboard_generation'
    | 'data_value_search'
    | 'chart_data_access'
    | 'sql_runner'
    | 'context_improvement'
    | 'semantic_change_proposals'
    | 'mcp_tools';

export type AiAgentKnowledgeDocumentSnapshot = {
    uuid: string;
    name: string;
    updatedAt: string;
    summary: AiAgentDocumentStructuredSummary;
};

export type AiAgentConfigSnapshot = {
    capturedAt: string;
    agentUpdatedAt: string | null;
    settings: AiAgentConfigurationSetting[];
    availableCapabilities: AiAgentAvailableCapability[];
    instructionHash: string | null;
    instructionSummary: string | null;
    knowledgeDocuments: AiAgentKnowledgeDocumentSnapshot[];
};

const normalizeForHash = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value
            .map(normalizeForHash)
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }

    if (value && typeof value === 'object') {
        return Object.keys(value)
            .sort()
            .reduce<Record<string, unknown>>((acc, key) => {
                const normalized = normalizeForHash(
                    (value as Record<string, unknown>)[key],
                );
                if (normalized !== undefined) {
                    acc[key] = normalized;
                }
                return acc;
            }, {});
    }

    return value;
};

const hashStringToBase36 = (
    input: string,
    modulus: number,
    base: number,
): string => {
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
        hash = (hash * base + input.charCodeAt(i)) % modulus;
    }

    return hash.toString(36).padStart(8, '0');
};

const hashCanonicalJson = (input: string): string =>
    [
        hashStringToBase36(input, 2_147_483_647, 31),
        hashStringToBase36(input, 2_147_483_629, 37),
    ].join('');

export const getAiAgentConfigSnapshotHash = (
    snapshot: AiAgentConfigSnapshot,
): string => {
    const canonicalJson = JSON.stringify(normalizeForHash(snapshot));
    return `ai_agent_review_config_snapshot:${hashCanonicalJson(canonicalJson)}`;
};

export type AiAgentRuntimeContextSnapshot = {
    userUuid: string | null;
    canRunSql: boolean;
    canManageAgent: boolean;
};

export type AiAgentModelMetadata = {
    provider: string | null;
    model: string | null;
};

export type AiAgentEvidenceWindow = {
    userPromptUuid: string;
    explicitFeedbackUuid: string | null;
    nextUserPromptUuid: string | null;
    previousPromptUuids: string[];
};

export type AiAgentSemanticTargetRef =
    | { type: 'model'; modelName: string; yamlPath?: string }
    | {
          type: 'explore';
          modelName: string;
          exploreName: string;
          yamlPath?: string;
      }
    | {
          type: 'join';
          modelName: string;
          joinName: string;
          exploreName?: string;
          yamlPath?: string;
      }
    | {
          type: 'dimension';
          modelName: string;
          dimensionName: string;
          yamlPath?: string;
      }
    | {
          type: 'metric';
          modelName: string;
          metricName: string;
          dimensionName?: string;
          yamlPath?: string;
      }
    | {
          type: 'additional_dimension';
          modelName: string;
          parentDimensionName: string;
          dimensionName: string;
          yamlPath?: string;
      }
    | {
          type: 'required_filter';
          modelName: string;
          exploreName: string;
          fieldName: string;
          yamlPath?: string;
      }
    | {
          type: 'ai_hint';
          modelName: string;
          targetType: 'model' | 'dimension' | 'metric';
          targetName: string;
          yamlPath?: string;
      };

export type AiAgentTargetRef =
    | AiAgentSemanticTargetRef
    | { type: 'agent'; agentUuid: string }
    | { type: 'agent_config'; setting: AiAgentConfigurationSetting }
    | { type: 'product_capability'; capabilityKey: string }
    | { type: 'runtime'; key: string };

export type AiAgentEvidenceExcerpt = {
    source:
        | 'user_prompt'
        | 'assistant_answer'
        | 'next_user_prompt'
        | 'conversation_context'
        | 'tool_call'
        | 'tool_result'
        | 'agent_config';
    text: string;
    redacted: boolean;
};

export type AiAgentRecommendationAction =
    | 'update_semantic_yaml'
    | 'update_agent_instructions'
    | 'add_knowledge_document'
    | 'enable_data_access'
    | 'enable_sql_mode'
    | 'enable_self_improvement'
    | 'configure_mcp_server'
    | 'adjust_explore_tags'
    | 'update_access'
    | 'route_to_product_work'
    | 'request_more_evidence'
    | 'no_action';

export type AiAgentRecommendation = {
    actionType: AiAgentRecommendationAction;
    title: string;
    rationale: string;
    targetRefs: AiAgentTargetRef[];
};

export type AiAgentReviewClassifierTurnSignal = {
    subject: AiAgentReviewClassifierSubject;
    interactionSource: AiAgentInteractionSource;
    sourceRef: AiAgentTurnSignalSourceRef;
    signal: AiAgentTurnSignal;
    implicitSignalSources: AiAgentImplicitSignalSource[];
    confidence: AiAgentReviewClassifierConfidence;
    promotedToFinding: boolean;
    promotionReason: string | null;
    toolEvidenceRefs: string[];
    runtimeContextSnapshot: AiAgentRuntimeContextSnapshot;
    modelMetadata: AiAgentModelMetadata;
};

export type AiAgentFindingReviewStatus =
    | 'unreviewed'
    | 'accepted'
    | 'rejected'
    | 'needs_more_evidence';

export type AiAgentReviewItemStatus =
    | 'open'
    | 'in_progress'
    | 'resolved'
    | 'dismissed'
    | 'duplicate';

export type AiAgentReviewItemDismissedReason =
    | 'not_actionable'
    | 'expected_behavior'
    | 'duplicate'
    | 'low_confidence'
    | 'other';

export type AiAgentReviewItemOwnerType =
    | 'semantic_layer_owner'
    | 'agent_admin'
    | 'product'
    | 'support'
    | 'unknown';

export type AiAgentReviewItemPrState = 'open' | 'merged' | 'closed';

const aiAgentConfigurationSettingSchema = z.enum([
    'instructions',
    'knowledge_documents',
    'data_access',
    'self_improvement',
    'sql_mode',
    'mcp_servers',
    'explore_tags',
    'space_access',
    'user_or_group_access',
    'unknown',
]);

const aiAgentJudgeTargetRefSchema = z.object({
    type: z.enum([
        'model',
        'explore',
        'join',
        'dimension',
        'metric',
        'additional_dimension',
        'required_filter',
        'ai_hint',
        'agent',
        'agent_config',
        'product_capability',
        'runtime',
    ]),
    label: z.string(),
    modelName: z.string().nullable(),
    fieldName: z.string().nullable(),
    setting: aiAgentConfigurationSettingSchema.nullable(),
    key: z.string().nullable(),
});

export const aiAgentReviewClassifierJudgeOutputSchema = z.object({
    signal: z.enum([
        'normal_refinement',
        'implicit_correction',
        'explicit_dispute',
        'retry_after_failure',
        'output_shape_correction',
        'new_question',
        'acceptance_or_continuation',
        'product_capability_request',
        'human_intervention',
        'ambiguous',
    ]),
    implicitSignalSources: z.array(
        z.enum([
            'next_user_correction',
            'next_user_dispute',
            'next_user_retry',
            'output_shape_correction',
            'tool_error',
            'assistant_no_answer',
            'product_capability_request',
            'human_intervention',
        ]),
    ),
    confidence: z.enum(['low', 'medium', 'high']),
    promotedToFinding: z.boolean(),
    promotionReason: z.string().nullable(),
    primaryRootCause: z.enum([
        'semantic_layer',
        'project_context',
        'agent_configuration',
        'data_gap',
        'product_capability',
        'runtime_reliability',
        'feedback_quality',
        'not_a_failure',
        'ambiguous',
    ]),
    secondaryRootCauses: z.array(
        z.enum([
            'semantic_layer',
            'project_context',
            'agent_configuration',
            'data_gap',
            'product_capability',
            'runtime_reliability',
            'feedback_quality',
            'not_a_failure',
            'ambiguous',
        ]),
    ),
    subcategories: z.array(z.string()),
    fixTargets: z.array(
        z.enum([
            'semantic_yaml_patch',
            'project_context_rule',
            'agent_configuration_change',
            'dbt_modeling_ticket',
            'semantic_layer_ticket',
            'product_capability_ticket',
            'runtime_reliability_ticket',
            'feedback_needed',
            'no_action',
        ]),
    ),
    targetRefs: z.array(aiAgentJudgeTargetRefSchema),
    agentConfigurationSettings: z.array(aiAgentConfigurationSettingSchema),
    ownerType: z.enum([
        'semantic_layer_owner',
        'agent_admin',
        'product',
        'support',
        'unknown',
    ]),
    evidenceExcerpts: z.array(
        z.object({
            source: z.enum([
                'user_prompt',
                'assistant_answer',
                'next_user_prompt',
                'conversation_context',
                'tool_call',
                'tool_result',
                'agent_config',
            ]),
            text: z.string(),
            redacted: z.boolean(),
        }),
    ),
    recommendation: z
        .object({
            actionType: z.enum([
                'update_semantic_yaml',
                'update_agent_instructions',
                'add_knowledge_document',
                'enable_data_access',
                'enable_sql_mode',
                'enable_self_improvement',
                'configure_mcp_server',
                'adjust_explore_tags',
                'update_access',
                'route_to_product_work',
                'request_more_evidence',
                'no_action',
            ]),
            title: z.string(),
            rationale: z.string(),
            targetRefs: z.array(aiAgentJudgeTargetRefSchema),
        })
        .nullable(),
    reviewItem: z.object({
        title: z.string(),
        description: z.string(),
    }),
});

export type AiAgentReviewClassifierJudgeOutput = z.infer<
    typeof aiAgentReviewClassifierJudgeOutputSchema
>;

export type AiAgentReviewItem = {
    uuid: string;
    fingerprint: string;
    organizationUuid: string;
    projectUuid: string | null;
    agentUuid: string | null;
    title: string;
    description: string;
    primaryRootCause: AiAgentRootCause;
    status: AiAgentReviewItemStatus;
    dismissedReason: AiAgentReviewItemDismissedReason | null;
    ownerType: AiAgentReviewItemOwnerType;
    assignedToUserUuid: string | null;
    firstSeenAt: Date;
    lastSeenAt: Date;
    findingCount: number;
    statusUpdatedAt: Date;
    statusUpdatedByUserUuid: string | null;
    linkedIssueUrl: string | null;
    linkedPrUrl: string | null;
    prState: AiAgentReviewItemPrState | null;
    createdAt: Date;
    updatedAt: Date;
};

export type AiAgentReviewItemSummary = AiAgentReviewItem & {
    latestFinding: {
        uuid: string;
        promptUuid: string;
        threadUuid: string;
        projectUuid: string;
        agentUuid: string;
        subcategories: string[];
        fixTargets: AiAgentFixTarget[];
        targetRefs: AiAgentTargetRef[];
        evidenceExcerpts: AiAgentEvidenceExcerpt[];
        recommendation: AiAgentRecommendation | null;
        createdAt: Date;
    } | null;
};

export type ApiAiAgentReviewItemsResponse = ApiSuccess<
    AiAgentReviewItemSummary[]
>;

export type AiAgentReviewSignalSummary = {
    uuid: string;
    runUuid: string;
    promptUuid: string;
    threadUuid: string;
    projectUuid: string;
    agentUuid: string;
    signal: AiAgentTurnSignal;
    implicitSignalSources: AiAgentImplicitSignalSource[];
    confidence: AiAgentReviewClassifierConfidence;
    promotedToFinding: boolean;
    promotionReason: string | null;
    createdAt: Date;
    runScope: AiAgentReviewClassifierRunScope;
    prompt: string;
    responsePreview: string | null;
    errorMessage: string | null;
    finding: {
        uuid: string;
        reviewItemUuid: string | null;
        primaryRootCause: AiAgentRootCause;
        subcategories: string[];
        fixTargets: AiAgentFixTarget[];
        evidenceExcerpts: AiAgentEvidenceExcerpt[];
        recommendation: AiAgentRecommendation | null;
    } | null;
};

export type ApiAiAgentReviewSignalsResponse = ApiSuccess<
    AiAgentReviewSignalSummary[]
>;

export type AiAgentReviewClassifierRunStatus =
    | 'queued'
    | 'running'
    | 'completed'
    | 'failed';

export type AiAgentReviewClassifierRunScope =
    | {
          type: 'backfill';
          startedAt: string;
          endedAt: string;
          projectUuid?: string;
          agentUuid?: string;
          dryRun?: boolean;
      }
    | {
          type: 'live_event';
          eventType: AiAgentReviewClassifierEventType;
          promptUuid: string;
          threadUuid: string;
          projectUuid: string;
          agentUuid: string;
      }
    | {
          type: 'manual';
          requestedByUserUuid: string;
          filters: Record<string, unknown>;
      };

export type AiAgentReviewClassifierRun = {
    uuid: string;
    organizationUuid: string;
    status: AiAgentReviewClassifierRunStatus;
    reviewAgentVersion: string;
    judgePromptHash: string;
    agentConfigSnapshotHash: string | null;
    agentConfigSnapshot: AiAgentConfigSnapshot | null;
    agentConfigSnapshotAgentUpdatedAt: Date | null;
    runScope: AiAgentReviewClassifierRunScope;
    totalTurns: number;
    processedTurns: number;
    signalCount: number;
    findingCount: number;
    reviewItemCount: number;
    errorMessage: string | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
};

export type AiAgentReviewClassifierTurnSnapshot = {
    promptUuid: string;
    userPrompt: string;
    assistantResponse: string | null;
    errorMessage: string | null;
    createdAt: Date;
    respondedAt: Date | null;
};

export type AiAgentReviewClassifierContextTurn =
    AiAgentReviewClassifierTurnSnapshot & {
        relation: 'previous' | 'next' | 'referenced';
    };

export type AiAgentReviewClassifierTurnCandidate = {
    subject: AiAgentReviewClassifierSubject;
    interactionSource: AiAgentInteractionSource;
    sourceRef: AiAgentTurnSignalSourceRef;
    targetTurn: AiAgentReviewClassifierTurnSnapshot;
    contextTurns: AiAgentReviewClassifierContextTurn[];
    reviewHints?: {
        useTargetPromptAsCorrectionEvidence?: boolean;
    };
    userPrompt: string;
    assistantResponse: string | null;
    errorMessage: string | null;
    humanScore: number | null;
    humanFeedback: string | null;
    createdAt: Date;
    respondedAt: Date | null;
    nextUserPromptUuid: string | null;
    nextUserPrompt: string | null;
    modelMetadata: AiAgentModelMetadata;
    tokenUsageTotal: number | null;
    queryHistory: AiAgentReviewClassifierQueryHistorySummary[];
    supportingEvidence: AiAgentReviewClassifierSupportingEvidence[];
};

export type AiAgentReviewClassifierQueryHistorySummary = {
    queryUuid: string;
    status: QueryHistoryStatus;
    error: string | null;
    createdAt: Date;
    totalRowCount: number | null;
    warehouseExecutionTimeMs: number | null;
    metricQuery: Pick<
        MetricQuery,
        'exploreName' | 'dimensions' | 'metrics' | 'filters' | 'sorts'
    >;
};

export type AiAgentReviewClassifierSupportingEvidence = {
    source: 'tool_trace';
    toolCallId: string;
    toolName: string;
    parentToolCallId: string | null;
    createdAt: Date;
    relevanceScore: number;
    toolArgsPreview: string | null;
    resultPreview: string | null;
};

export type AiAgentReviewClassifierSignalFinding = {
    primaryRootCause: AiAgentRootCause;
    secondaryRootCauses: AiAgentRootCause[];
    subcategories: string[];
    fixTargets: AiAgentFixTarget[];
    targetRefs: AiAgentTargetRef[];
    evidenceExcerpts: AiAgentEvidenceExcerpt[];
    recommendation: AiAgentRecommendation | null;
    reviewItem: {
        fingerprint: string;
        title: string;
        description: string;
        ownerType: AiAgentReviewItemOwnerType;
    };
};

export type AiAgentReviewItemFingerprintInput = {
    organizationUuid: string;
    projectUuid: string | null;
    agentUuid: string | null;
    primaryRootCause: AiAgentRootCause;
    subcategories: string[];
    fixTargets: AiAgentFixTarget[];
    targetRefs: AiAgentTargetRef[];
    agentConfigurationSettings: AiAgentConfigurationSetting[];
    capabilityKey: string | null;
};

type AiAgentReviewItemFingerprintScope =
    | {
          type: 'organization';
          organizationUuid: string;
      }
    | {
          type: 'project';
          organizationUuid: string;
          projectUuid: string;
      }
    | {
          type: 'agent';
          organizationUuid: string;
          agentUuid: string;
      };

const requireScopeValue = (
    value: string | null,
    field: 'projectUuid' | 'agentUuid',
    rootCause: AiAgentRootCause,
): string => {
    if (!value) {
        throw new Error(`${field} is required for ${rootCause} fingerprints`);
    }
    return value;
};

export const getAiAgentReviewItemFingerprintScope = (
    input: Pick<
        AiAgentReviewItemFingerprintInput,
        'organizationUuid' | 'projectUuid' | 'agentUuid' | 'primaryRootCause'
    >,
): AiAgentReviewItemFingerprintScope => {
    switch (input.primaryRootCause) {
        case 'semantic_layer':
        case 'project_context':
        case 'data_gap':
            return {
                type: 'project',
                organizationUuid: input.organizationUuid,
                projectUuid: requireScopeValue(
                    input.projectUuid,
                    'projectUuid',
                    input.primaryRootCause,
                ),
            };
        case 'agent_configuration':
            return {
                type: 'agent',
                organizationUuid: input.organizationUuid,
                agentUuid: requireScopeValue(
                    input.agentUuid,
                    'agentUuid',
                    input.primaryRootCause,
                ),
            };
        default:
            return input.projectUuid
                ? {
                      type: 'project',
                      organizationUuid: input.organizationUuid,
                      projectUuid: input.projectUuid,
                  }
                : {
                      type: 'organization',
                      organizationUuid: input.organizationUuid,
                  };
    }
};

export const getAiAgentReviewItemFingerprint = (
    input: AiAgentReviewItemFingerprintInput,
): string => {
    const scope = getAiAgentReviewItemFingerprintScope(input);
    const canonicalJson = JSON.stringify(
        normalizeForHash({
            scope,
            primaryRootCause: input.primaryRootCause,
            subcategories: input.subcategories,
            fixTargets: input.fixTargets,
            targetRefs: input.targetRefs,
            agentConfigurationSettings: input.agentConfigurationSettings,
            capabilityKey: input.capabilityKey,
        }),
    );

    return `ai_agent_review_item:${hashCanonicalJson(canonicalJson)}`;
};
