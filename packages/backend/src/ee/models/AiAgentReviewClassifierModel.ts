import { ProjectType, QueryExecutionContext } from '@lightdash/common';
import type {
    AiAgentConfigSnapshot,
    AiAgentEvidenceExcerpt,
    AiAgentFixTarget,
    AiAgentImplicitSignalSource,
    AiAgentRecommendation,
    AiAgentReviewClassifierConfidence,
    AiAgentReviewClassifierContextTurn,
    AiAgentReviewClassifierQueryHistorySummary,
    AiAgentReviewClassifierRun,
    AiAgentReviewClassifierRunScope,
    AiAgentReviewClassifierRunStatus,
    AiAgentReviewClassifierSignalFinding,
    AiAgentReviewClassifierSupportingEvidence,
    AiAgentReviewClassifierTurnCandidate,
    AiAgentReviewClassifierTurnSignal,
    AiAgentReviewItemDismissedReason,
    AiAgentReviewItemPrState,
    AiAgentReviewItemStatus,
    AiAgentReviewItemSummary,
    AiAgentReviewItemWritebackEligibility,
    AiAgentReviewItemWritebackStatus,
    AiAgentReviewRemediation,
    AiAgentReviewRemediationEvent,
    AiAgentReviewRemediationEventDetail,
    AiAgentReviewRemediationStatus,
    AiAgentReviewSignalSummary,
    AiAgentRootCause,
    AiAgentTargetRef,
    AiAgentTurnSignal,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { ProjectTableName } from '../../database/entities/projects';
import { PullRequestsTableName } from '../../database/entities/pullRequests';
import { QueryHistoryTableName } from '../../database/entities/queryHistory';
import {
    AiAgentToolCallTableName,
    AiAgentToolResultTableName,
    AiPromptTableName,
    AiSlackPromptTableName,
    AiSlackThreadTableName,
    AiThreadTableName,
    AiWritebackThreadTableName,
} from '../database/entities/ai';
import {
    AiAgentReviewClassifierRunTableName,
    AiAgentReviewItemTableName,
    AiAgentReviewRemediationEventsTableName,
    AiAgentReviewRemediationTableName,
    AiAgentTurnSignalTableName,
    type AiAgentReviewClassifierRunTable,
    type AiAgentReviewItemTable,
    type AiAgentReviewRemediationEventsTable,
    type AiAgentReviewRemediationTable,
    type AiAgentTurnSignalTable,
    type DbAiAgentReviewClassifierRun,
    type DbAiAgentReviewItem,
    type DbAiAgentReviewRemediation,
    type DbAiAgentReviewRemediationEvent,
    type DbAiAgentTurnSignal,
} from '../database/entities/aiAgentReviewClassifier';

type Dependencies = {
    database: Knex;
};

type ReviewItemAggregateRow = {
    fingerprint: string;
    first_seen_at: Date | string;
    last_seen_at: Date | string;
    finding_count: string | number;
};

type ReviewRemediationRow = DbAiAgentReviewRemediation & {
    linked_pr_url: string | null;
    updated_at_age_ms: number;
};

type ReviewItemRow = DbAiAgentReviewItem & {
    updated_at_age_ms: number;
};

// Longer than the worker's 30-min job timeout — past this, a queued/running
// writeback has lost its worker and is reported as failed so the UI recovers
// and retries. Ages are computed in SQL (now() - updated_at) so the check is
// immune to the driver parsing tz-less timestamps in the process's local
// timezone and to app/DB clock drift.
export const WRITEBACK_STALE_MS = 35 * 60 * 1000;

const WRITEBACK_TIMED_OUT_MESSAGE = 'Writeback timed out';

const isStaleWritebackStatus = (
    status:
        | AiAgentReviewItemWritebackStatus
        | AiAgentReviewRemediationStatus
        | null,
    ageMs: number,
): boolean =>
    (status === 'queued' || status === 'running') && ageMs > WRITEBACK_STALE_MS;

const defaultWritebackEligibility: AiAgentReviewItemWritebackEligibility = {
    eligible: false,
    reason: 'reviews_disabled',
    provider: null,
    strategy: null,
};

const ACTIVE_REMEDIATION_STATUSES: AiAgentReviewRemediationStatus[] = [
    'queued',
    'running',
    'pr_open',
    'preview_ready',
];

const mapReviewRemediation = (
    row: ReviewRemediationRow,
): AiAgentReviewRemediation => {
    const stale = isStaleWritebackStatus(row.status, row.updated_at_age_ms);
    return {
        uuid: row.ai_agent_review_remediation_uuid,
        fingerprint: row.fingerprint,
        organizationUuid: row.organization_uuid,
        sourceFindingUuid: row.source_ai_agent_review_turn_signal_uuid,
        sourcePromptUuid: row.source_prompt_uuid,
        sourceThreadUuid: row.source_thread_uuid,
        sourceProjectUuid: row.source_project_uuid,
        sourceAgentUuid: row.source_agent_uuid,
        workThreadUuid: row.work_thread_uuid,
        pullRequestUuid: row.pull_request_uuid,
        linkedPrUrl: row.linked_pr_url,
        previewProjectUuid: row.preview_project_uuid,
        previewAgentUuid: row.preview_agent_uuid,
        previewThreadUuid: row.preview_thread_uuid,
        status: stale ? 'failed' : row.status,
        errorMessage: stale ? WRITEBACK_TIMED_OUT_MESSAGE : row.error_message,
        retryPrompt: row.retry_prompt,
        createdByUserUuid: row.created_by_user_uuid,
        resolvedByUserUuid: row.resolved_by_user_uuid,
        resolvedAt: row.resolved_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
};

type CreateRunArgs = {
    organizationUuid: string;
    reviewAgentVersion: string;
    judgePromptHash: string;
    runScope: AiAgentReviewClassifierRunScope;
    agentConfigSnapshotHash?: string | null;
    agentConfigSnapshot?: AiAgentConfigSnapshot | null;
    agentConfigSnapshotAgentUpdatedAt?: Date | null;
    status?: AiAgentReviewClassifierRunStatus;
    totalTurns?: number;
};

type UpdateRunArgs = {
    runUuid: string;
    status?: AiAgentReviewClassifierRunStatus;
    totalTurns?: number;
    processedTurns?: number;
    signalCount?: number;
    findingCount?: number;
    reviewItemCount?: number;
    errorMessage?: string | null;
    completedAt?: Date | null;
};

type ListTurnReviewCandidatesArgs = {
    organizationUuid: string;
    projectUuid?: string;
    agentUuid?: string;
    threadUuid?: string;
    promptUuid?: string;
    startedAt?: Date;
    endedAt?: Date;
    limit?: number;
};

type ListReviewItemsArgs = {
    organizationUuid: string;
    projectUuid?: string;
    agentUuid?: string;
    fingerprint?: string;
    statuses?: AiAgentReviewItemStatus[];
    limit?: number;
};

type UpsertReviewItemStateArgs = {
    fingerprint: string;
    organizationUuid: string;
    projectUuid: string;
    agentUuid: string;
    status: AiAgentReviewItemStatus;
    dismissedReason: AiAgentReviewItemDismissedReason | null;
    statusUpdatedByUserUuid: string | null;
    // undefined = leave the manual board order untouched (plain status change);
    // a number repositions the card; null clears it back to default order.
    boardPosition?: number | null;
};

type CreateReviewRemediationArgs = {
    fingerprint: string;
    organizationUuid: string;
    sourceFindingUuid: string;
    sourcePromptUuid: string;
    sourceThreadUuid: string;
    sourceProjectUuid: string;
    sourceAgentUuid: string;
    workThreadUuid: string | null;
    retryPrompt: string | null;
    createdByUserUuid: string | null;
};

type UpdateReviewRemediationStatusArgs = {
    remediationUuid: string;
    organizationUuid: string;
    status: AiAgentReviewRemediationStatus;
    errorMessage?: string | null;
    resolvedByUserUuid?: string | null;
};

type SetReviewRemediationPullRequestArgs = {
    remediationUuid: string;
    organizationUuid: string;
    pullRequestUuid: string;
};

type SetReviewRemediationPreviewArgs = {
    remediationUuid: string;
    organizationUuid: string;
    previewProjectUuid: string;
    previewAgentUuid: string;
};

type SetReviewRemediationPreviewThreadArgs = {
    remediationUuid: string;
    organizationUuid: string;
    previewProjectUuid: string;
    previewAgentUuid: string;
    previewThreadUuid: string;
};

type ListReviewSignalsArgs = {
    organizationUuid: string;
    projectUuid?: string;
    agentUuid?: string;
    limit?: number;
};

type GetPromptTextArgs = {
    organizationUuid: string;
    promptUuid: string;
};

type BaseCandidateRow = {
    ai_prompt_uuid: string;
    ai_thread_uuid: string;
    organization_uuid: string;
    project_uuid: string;
    agent_uuid: string;
    created_from: 'web_app' | 'slack';
    prompt: string;
    response: string | null;
    error_message: string | null;
    human_score: number | null;
    human_feedback: string | null;
    prompt_created_at: Date;
    responded_at: Date | null;
    model_config: { modelName: string; modelProvider: string } | null;
    token_usage: { totalTokens?: number } | null;
    slack_channel_id: string | null;
    slack_thread_ts: string | null;
    prompt_slack_ts: string | null;
};

type TurnReviewCandidateRow = BaseCandidateRow & {
    next_user_prompt_uuid: string | null;
    next_user_prompt: string | null;
    previous_turn_context:
        | (Omit<
              AiAgentReviewClassifierContextTurn,
              'createdAt' | 'respondedAt'
          > & {
              createdAt: string;
              respondedAt: string | null;
          })[]
        | null;
    query_history_summaries:
        | (Omit<AiAgentReviewClassifierQueryHistorySummary, 'createdAt'> & {
              createdAt: string;
          })[]
        | null;
    supporting_evidence_summaries:
        | (Omit<AiAgentReviewClassifierSupportingEvidence, 'createdAt'> & {
              createdAt: string;
          })[]
        | null;
};

type ToolCallEvidenceRow = {
    tool_call_id: string;
    tool_name: string;
    parent_tool_call_id: string | null;
    created_at: Date;
    tool_args: unknown;
    result: string | null;
};

const TOOL_NAME_PRIORITY = new Map<string, number>([
    ['editDbtProject', 95],
    ['propose_writeback', 95],
    ['runAiWriteback', 95],
    ['run_ai_writeback', 95],
    ['findFields', 80],
    ['find_fields', 80],
    ['findExplores', 70],
    ['find_explores', 70],
    ['runQuery', 65],
    ['run_metric_query', 65],
    ['runSql', 60],
    ['run_sql', 60],
    ['searchFieldValues', 55],
    ['search_field_values', 55],
    ['discoverFields', 50],
]);

const TOOL_RESULT_ERROR_PATTERN =
    /no match|no relevant|not found|empty|error|failed/i;

const tokenize = (text: string): Set<string> =>
    new Set(
        text
            .toLowerCase()
            .split(/[^a-z0-9]+/i)
            .filter((token) => token.length > 2),
    );

const rankToolCallEvidence = ({
    rows,
    userPrompt,
    humanFeedback,
    errorMessage,
}: {
    rows: ToolCallEvidenceRow[];
    userPrompt: string;
    humanFeedback: string | null;
    errorMessage: string | null;
}): (ToolCallEvidenceRow & { relevance_score: number })[] => {
    const queryText = [userPrompt, humanFeedback, errorMessage]
        .filter((value): value is string => Boolean(value))
        .join(' ')
        .slice(0, 1000);
    const queryTokens = tokenize(queryText);

    return rows
        .map((row) => {
            const argsText =
                typeof row.tool_args === 'string'
                    ? row.tool_args
                    : JSON.stringify(row.tool_args ?? '');
            const resultText = row.result ?? '';
            const haystackTokens = tokenize(
                `${row.tool_name} ${argsText} ${resultText}`,
            );
            const overlapCount = Array.from(queryTokens).reduce(
                (count, token) => count + (haystackTokens.has(token) ? 1 : 0),
                0,
            );
            const overlapBonus =
                queryTokens.size > 0
                    ? (100 * overlapCount) / queryTokens.size
                    : 0;

            const nameScore = TOOL_NAME_PRIORITY.get(row.tool_name) ?? 10;
            const parentBonus = row.parent_tool_call_id ? 15 : 0;
            const errorBonus = TOOL_RESULT_ERROR_PATTERN.test(resultText)
                ? 25
                : 0;

            return {
                ...row,
                relevance_score:
                    nameScore + parentBonus + errorBonus + overlapBonus,
            };
        })
        .sort(
            (a, b) =>
                b.relevance_score - a.relevance_score ||
                a.created_at.getTime() - b.created_at.getTime(),
        );
};

const previewToolArgs = (toolArgs: unknown): string | null => {
    const serialized =
        typeof toolArgs === 'string' ? toolArgs : JSON.stringify(toolArgs);
    if (!serialized) return null;
    const truncated = serialized.slice(0, 800);
    return truncated.length > 0 ? truncated : null;
};

const previewResult = (result: string | null): string | null => {
    if (!result) return null;
    const truncated = result.slice(0, 1200);
    return truncated.length > 0 ? truncated : null;
};

type ReviewSignalSummaryRow = {
    ai_agent_review_turn_signal_uuid: string;
    ai_agent_review_run_uuid: string;
    ai_prompt_uuid: string;
    ai_thread_uuid: string;
    project_uuid: string;
    agent_uuid: string;
    signal: AiAgentTurnSignal;
    implicit_signal_sources: AiAgentImplicitSignalSource[];
    confidence: AiAgentReviewClassifierConfidence;
    promoted_to_finding: boolean;
    promotion_reason: string | null;
    signal_created_at: Date;
    run_scope: AiAgentReviewClassifierRunScope;
    prompt: string;
    response: string | null;
    error_message: string | null;
    fingerprint: string | null;
    primary_root_cause: AiAgentRootCause | null;
    subcategories: string[] | null;
    fix_targets: AiAgentFixTarget[] | null;
    target_refs: AiAgentTargetRef[] | null;
    evidence_excerpts: AiAgentEvidenceExcerpt[] | null;
    recommendation: AiAgentRecommendation | null;
};

type CreateTurnSignalArgs = {
    runUuid: string;
    turnSignal: AiAgentReviewClassifierTurnSignal;
    finding?: AiAgentReviewClassifierSignalFinding | null;
};

export class AiAgentReviewClassifierModel {
    private readonly database: Knex;

    constructor({ database }: Dependencies) {
        this.database = database;
    }

    private jsonb(value: unknown): Knex.Raw {
        return this.database.raw('?::jsonb', [JSON.stringify(value)]);
    }

    static mapRun(
        row: DbAiAgentReviewClassifierRun,
    ): AiAgentReviewClassifierRun {
        return {
            uuid: row.ai_agent_review_run_uuid,
            organizationUuid: row.organization_uuid,
            status: row.status,
            reviewAgentVersion: row.review_agent_version,
            judgePromptHash: row.judge_prompt_hash,
            agentConfigSnapshotHash: row.agent_config_snapshot_hash,
            agentConfigSnapshot: row.agent_config_snapshot,
            agentConfigSnapshotAgentUpdatedAt:
                row.agent_config_snapshot_agent_updated_at,
            runScope: row.run_scope,
            totalTurns: row.total_turns,
            processedTurns: row.processed_turns,
            signalCount: row.signal_count,
            findingCount: row.finding_count,
            reviewItemCount: row.review_item_count,
            errorMessage: row.error_message,
            completedAt: row.completed_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    static mapReviewSignalSummary(
        row: ReviewSignalSummaryRow,
    ): AiAgentReviewSignalSummary {
        return {
            uuid: row.ai_agent_review_turn_signal_uuid,
            runUuid: row.ai_agent_review_run_uuid,
            promptUuid: row.ai_prompt_uuid,
            threadUuid: row.ai_thread_uuid,
            projectUuid: row.project_uuid,
            agentUuid: row.agent_uuid,
            signal: row.signal,
            implicitSignalSources: row.implicit_signal_sources,
            confidence: row.confidence,
            promotedToFinding: row.promoted_to_finding,
            promotionReason: row.promotion_reason,
            createdAt: row.signal_created_at,
            runScope: row.run_scope,
            prompt: row.prompt,
            responsePreview: row.response ? row.response.slice(0, 800) : null,
            errorMessage: row.error_message,
            finding: row.promoted_to_finding
                ? {
                      uuid: row.ai_agent_review_turn_signal_uuid,
                      reviewItemUuid: row.fingerprint,
                      primaryRootCause: row.primary_root_cause ?? 'ambiguous',
                      subcategories: row.subcategories ?? [],
                      fixTargets: row.fix_targets ?? [],
                      evidenceExcerpts: row.evidence_excerpts ?? [],
                      recommendation: row.recommendation,
                  }
                : null,
        };
    }

    static mapTurnReviewCandidate(
        row: TurnReviewCandidateRow,
    ): AiAgentReviewClassifierTurnCandidate {
        const interactionSource =
            row.created_from === 'slack' ? 'slack' : 'app';
        return {
            subject: {
                type: 'turn_review',
                assistantPromptUuid: row.ai_prompt_uuid,
                threadUuid: row.ai_thread_uuid,
                agentUuid: row.agent_uuid,
                projectUuid: row.project_uuid,
                organizationUuid: row.organization_uuid,
            },
            interactionSource,
            sourceRef:
                interactionSource === 'slack'
                    ? {
                          source: 'slack',
                          channelId: row.slack_channel_id ?? '',
                          threadTs: row.slack_thread_ts,
                          messageTs: row.prompt_slack_ts ?? row.ai_prompt_uuid,
                          slackPermalink: null,
                      }
                    : {
                          source: 'app',
                          threadUuid: row.ai_thread_uuid,
                          promptUuid: row.ai_prompt_uuid,
                          appUrl: null,
                      },
            targetTurn: {
                promptUuid: row.ai_prompt_uuid,
                userPrompt: row.prompt,
                assistantResponse: row.response,
                errorMessage: row.error_message,
                createdAt: row.prompt_created_at,
                respondedAt: row.responded_at,
            },
            contextTurns: (row.previous_turn_context ?? []).map(
                (contextTurn) => ({
                    ...contextTurn,
                    createdAt: new Date(contextTurn.createdAt),
                    respondedAt: contextTurn.respondedAt
                        ? new Date(contextTurn.respondedAt)
                        : null,
                }),
            ),
            userPrompt: row.prompt,
            assistantResponse: row.response,
            errorMessage: row.error_message,
            humanScore: row.human_score,
            humanFeedback: row.human_feedback,
            createdAt: row.prompt_created_at,
            respondedAt: row.responded_at,
            nextUserPromptUuid: row.next_user_prompt_uuid,
            nextUserPrompt: row.next_user_prompt,
            modelMetadata: {
                provider: row.model_config?.modelProvider ?? null,
                model: row.model_config?.modelName ?? null,
            },
            tokenUsageTotal:
                typeof row.token_usage?.totalTokens === 'number'
                    ? row.token_usage.totalTokens
                    : null,
            queryHistory: (row.query_history_summaries ?? []).map(
                (queryHistory) => ({
                    ...queryHistory,
                    createdAt: new Date(queryHistory.createdAt),
                    metricQuery: {
                        exploreName: queryHistory.metricQuery.exploreName,
                        dimensions: queryHistory.metricQuery.dimensions ?? [],
                        metrics: queryHistory.metricQuery.metrics ?? [],
                        filters: queryHistory.metricQuery.filters,
                        sorts: queryHistory.metricQuery.sorts ?? [],
                    },
                }),
            ),
            supportingEvidence: (row.supporting_evidence_summaries ?? []).map(
                (evidence) => ({
                    ...evidence,
                    createdAt: new Date(evidence.createdAt),
                }),
            ),
        };
    }

    async createRun(args: CreateRunArgs): Promise<AiAgentReviewClassifierRun> {
        const [row] = await this.database<AiAgentReviewClassifierRunTable>(
            AiAgentReviewClassifierRunTableName,
        )
            .insert({
                organization_uuid: args.organizationUuid,
                review_agent_version: args.reviewAgentVersion,
                judge_prompt_hash: args.judgePromptHash,
                run_scope: this.jsonb(args.runScope) as never,
                agent_config_snapshot_hash: args.agentConfigSnapshotHash,
                agent_config_snapshot: args.agentConfigSnapshot
                    ? (this.jsonb(args.agentConfigSnapshot) as never)
                    : null,
                agent_config_snapshot_agent_updated_at:
                    args.agentConfigSnapshotAgentUpdatedAt,
                status: args.status,
                total_turns: args.totalTurns,
            })
            .returning('*');

        return AiAgentReviewClassifierModel.mapRun(row);
    }

    async updateRun(args: UpdateRunArgs): Promise<AiAgentReviewClassifierRun> {
        const update: Omit<
            Partial<DbAiAgentReviewClassifierRun>,
            'updated_at'
        > & {
            updated_at: Knex.Raw;
        } = {
            updated_at: this.database.fn.now(),
        };

        if (args.status !== undefined) update.status = args.status;
        if (args.totalTurns !== undefined) update.total_turns = args.totalTurns;
        if (args.processedTurns !== undefined) {
            update.processed_turns = args.processedTurns;
        }
        if (args.signalCount !== undefined) {
            update.signal_count = args.signalCount;
        }
        if (args.findingCount !== undefined) {
            update.finding_count = args.findingCount;
        }
        if (args.reviewItemCount !== undefined) {
            update.review_item_count = args.reviewItemCount;
        }
        if (args.errorMessage !== undefined) {
            update.error_message = args.errorMessage;
        }
        if (args.completedAt !== undefined) {
            update.completed_at = args.completedAt;
        }

        const [row] = await this.database<AiAgentReviewClassifierRunTable>(
            AiAgentReviewClassifierRunTableName,
        )
            .where('ai_agent_review_run_uuid', args.runUuid)
            .update(update)
            .returning('*');

        return AiAgentReviewClassifierModel.mapRun(row);
    }

    async listTurnReviewCandidates(
        args: ListTurnReviewCandidatesArgs,
    ): Promise<AiAgentReviewClassifierTurnCandidate[]> {
        const baseRows = await this.fetchBaseCandidateRows(args);

        const enriched = await Promise.all(
            baseRows.map(async (base) => {
                const [
                    nextPrompt,
                    previousTurnContext,
                    queryHistorySummaries,
                    supportingEvidenceSummaries,
                ] = await Promise.all([
                    this.fetchNextPrompt(
                        base.ai_thread_uuid,
                        base.prompt_created_at,
                    ),
                    this.fetchPreviousTurnContext(
                        base.ai_thread_uuid,
                        base.prompt_created_at,
                    ),
                    this.fetchQueryHistorySummaries(
                        base.organization_uuid,
                        base.project_uuid,
                        base.prompt_created_at,
                        base.responded_at,
                    ),
                    this.fetchSupportingEvidence(
                        base.ai_prompt_uuid,
                        base.prompt,
                        base.human_feedback,
                        base.error_message,
                    ),
                ]);

                const row: TurnReviewCandidateRow = {
                    ...base,
                    next_user_prompt_uuid: nextPrompt?.ai_prompt_uuid ?? null,
                    next_user_prompt: nextPrompt?.prompt ?? null,
                    previous_turn_context: previousTurnContext,
                    query_history_summaries: queryHistorySummaries,
                    supporting_evidence_summaries: supportingEvidenceSummaries,
                };

                return AiAgentReviewClassifierModel.mapTurnReviewCandidate(row);
            }),
        );

        return enriched;
    }

    private async fetchBaseCandidateRows(
        args: ListTurnReviewCandidatesArgs,
    ): Promise<BaseCandidateRow[]> {
        const query = this.database(`${AiPromptTableName} as prompt`)
            .join(
                `${AiThreadTableName} as thread`,
                'thread.ai_thread_uuid',
                'prompt.ai_thread_uuid',
            )
            .leftJoin(
                `${AiSlackPromptTableName} as slack_prompt`,
                'slack_prompt.ai_prompt_uuid',
                'prompt.ai_prompt_uuid',
            )
            .leftJoin(
                `${AiSlackThreadTableName} as slack_thread`,
                'slack_thread.ai_thread_uuid',
                'thread.ai_thread_uuid',
            )
            .join(
                `${ProjectTableName} as project`,
                'project.project_uuid',
                'thread.project_uuid',
            )
            .select<BaseCandidateRow[]>({
                ai_prompt_uuid: 'prompt.ai_prompt_uuid',
                ai_thread_uuid: 'prompt.ai_thread_uuid',
                organization_uuid: 'thread.organization_uuid',
                project_uuid: 'thread.project_uuid',
                agent_uuid: 'thread.agent_uuid',
                created_from: 'thread.created_from',
                prompt: 'prompt.prompt',
                response: 'prompt.response',
                error_message: 'prompt.error_message',
                human_score: 'prompt.human_score',
                human_feedback: 'prompt.human_feedback',
                prompt_created_at: 'prompt.created_at',
                responded_at: 'prompt.responded_at',
                model_config: 'prompt.model_config',
                token_usage: 'prompt.token_usage',
                slack_channel_id: 'slack_thread.slack_channel_id',
                slack_thread_ts: 'slack_thread.slack_thread_ts',
                prompt_slack_ts: 'slack_prompt.prompt_slack_ts',
            })
            .where('thread.organization_uuid', args.organizationUuid)
            .whereNotNull('thread.agent_uuid')
            // Preview projects host writeback verification threads — reviewing
            // them would feed the reviewer's own output back into itself.
            .whereNot('project.project_type', ProjectType.PREVIEW)
            // Remediation build-fix threads are the reviewer's own output;
            // reviewing them would open a review item on the fix it just made.
            .whereNotExists((builder) => {
                void builder
                    .select(this.database.raw('1'))
                    .from(`${AiAgentReviewRemediationTableName} as remediation`)
                    .whereRaw(
                        'remediation.work_thread_uuid = thread.ai_thread_uuid',
                    );
            })
            .whereIn('thread.created_from', ['web_app', 'slack'])
            .where((builder) => {
                void builder
                    .whereNotNull('prompt.response')
                    .orWhereNotNull('prompt.error_message');
            })
            .orderBy('prompt.created_at', 'desc')
            .limit(Math.min(args.limit ?? 500, 5000));

        if (args.projectUuid) {
            void query.where('thread.project_uuid', args.projectUuid);
        }
        if (args.agentUuid) {
            void query.where('thread.agent_uuid', args.agentUuid);
        }
        if (args.threadUuid) {
            void query.where('thread.ai_thread_uuid', args.threadUuid);
        }
        if (args.promptUuid) {
            void query.where('prompt.ai_prompt_uuid', args.promptUuid);
        }
        if (args.startedAt) {
            void query.where('prompt.created_at', '>=', args.startedAt);
        }
        if (args.endedAt) {
            void query.where('prompt.created_at', '<', args.endedAt);
        }

        return query;
    }

    private async fetchNextPrompt(
        threadUuid: string,
        after: Date,
    ): Promise<{ ai_prompt_uuid: string; prompt: string } | null> {
        const row = await this.database(AiPromptTableName)
            .select('ai_prompt_uuid', 'prompt')
            .where('ai_thread_uuid', threadUuid)
            .where('created_at', '>', after)
            .orderBy('created_at', 'asc')
            .first();
        return row ?? null;
    }

    private async fetchPreviousTurnContext(
        threadUuid: string,
        before: Date,
    ): Promise<TurnReviewCandidateRow['previous_turn_context']> {
        const rows = await this.database(AiPromptTableName)
            .select(
                'ai_prompt_uuid',
                'prompt',
                'response',
                'error_message',
                'created_at',
                'responded_at',
            )
            .where('ai_thread_uuid', threadUuid)
            .where('created_at', '<', before)
            .where((builder) => {
                void builder
                    .whereNotNull('response')
                    .orWhereNotNull('error_message');
            })
            .orderBy('created_at', 'desc')
            .limit(3);

        return rows
            .slice()
            .reverse()
            .map((row) => ({
                relation: 'previous' as const,
                promptUuid: row.ai_prompt_uuid,
                userPrompt: row.prompt,
                assistantResponse: row.response,
                errorMessage: row.error_message,
                createdAt: row.created_at.toISOString(),
                respondedAt: row.responded_at
                    ? row.responded_at.toISOString()
                    : null,
            }));
    }

    private async fetchQueryHistorySummaries(
        organizationUuid: string,
        projectUuid: string,
        promptCreatedAt: Date,
        respondedAt: Date | null,
    ): Promise<TurnReviewCandidateRow['query_history_summaries']> {
        const windowEnd = new Date(
            (respondedAt?.getTime() ??
                promptCreatedAt.getTime() + 10 * 60 * 1000) +
                2 * 60 * 1000,
        );

        const rows = await this.database(QueryHistoryTableName)
            .select(
                'query_uuid',
                'status',
                'error',
                'created_at',
                'total_row_count',
                'warehouse_execution_time_ms',
                'metric_query',
            )
            .where('organization_uuid', organizationUuid)
            .where('project_uuid', projectUuid)
            .where('context', QueryExecutionContext.AI)
            .where('created_at', '>=', promptCreatedAt)
            .where('created_at', '<=', windowEnd)
            .orderBy('created_at', 'asc');

        return rows.map((row) => ({
            queryUuid: row.query_uuid,
            status: row.status,
            error: row.error,
            createdAt: row.created_at.toISOString(),
            totalRowCount: row.total_row_count,
            warehouseExecutionTimeMs: row.warehouse_execution_time_ms,
            metricQuery: {
                exploreName: row.metric_query?.exploreName ?? '',
                dimensions: row.metric_query?.dimensions ?? [],
                metrics: row.metric_query?.metrics ?? [],
                filters: row.metric_query?.filters ?? {},
                sorts: row.metric_query?.sorts ?? [],
            },
        }));
    }

    private async fetchSupportingEvidence(
        promptUuid: string,
        userPrompt: string,
        humanFeedback: string | null,
        errorMessage: string | null,
    ): Promise<TurnReviewCandidateRow['supporting_evidence_summaries']> {
        const rows: ToolCallEvidenceRow[] = await this.database(
            `${AiAgentToolCallTableName} as tool_call`,
        )
            .leftJoin(
                `${AiAgentToolResultTableName} as tool_result`,
                function joinToolResult() {
                    this.on(
                        'tool_result.ai_prompt_uuid',
                        '=',
                        'tool_call.ai_prompt_uuid',
                    ).andOn(
                        'tool_result.tool_call_id',
                        '=',
                        'tool_call.tool_call_id',
                    );
                },
            )
            .select<ToolCallEvidenceRow[]>({
                tool_call_id: 'tool_call.tool_call_id',
                tool_name: 'tool_call.tool_name',
                parent_tool_call_id: 'tool_call.parent_tool_call_id',
                created_at: 'tool_call.created_at',
                tool_args: 'tool_call.tool_args',
                result: 'tool_result.result',
            })
            .where('tool_call.ai_prompt_uuid', promptUuid)
            .where((builder) => {
                void builder
                    .whereIn(
                        'tool_call.tool_name',
                        Array.from(TOOL_NAME_PRIORITY.keys()),
                    )
                    .orWhereNotNull('tool_call.parent_tool_call_id');
            });

        const ranked = rankToolCallEvidence({
            rows,
            userPrompt,
            humanFeedback,
            errorMessage,
        });

        return ranked.slice(0, 5).map((entry) => ({
            source: 'tool_trace' as const,
            toolCallId: entry.tool_call_id,
            toolName: entry.tool_name,
            parentToolCallId: entry.parent_tool_call_id,
            createdAt: entry.created_at.toISOString(),
            relevanceScore: entry.relevance_score,
            toolArgsPreview: previewToolArgs(entry.tool_args),
            resultPreview: previewResult(entry.result),
        }));
    }

    async listReviewItems(
        args: ListReviewItemsArgs,
    ): Promise<AiAgentReviewItemSummary[]> {
        const limit = Math.min(args.limit ?? 100, 500);
        if (args.statuses?.length === 0) {
            return [];
        }
        const baseQuery = this.database<AiAgentTurnSignalTable>(
            AiAgentTurnSignalTableName,
        )
            .where(
                `${AiAgentTurnSignalTableName}.organization_uuid`,
                args.organizationUuid,
            )
            .where(`${AiAgentTurnSignalTableName}.promoted_to_finding`, true)
            .whereNotNull(`${AiAgentTurnSignalTableName}.fingerprint`)
            .modify((query) => {
                if (args.projectUuid) {
                    void query.where(
                        `${AiAgentTurnSignalTableName}.project_uuid`,
                        args.projectUuid,
                    );
                }
                if (args.agentUuid) {
                    void query.where(
                        `${AiAgentTurnSignalTableName}.agent_uuid`,
                        args.agentUuid,
                    );
                }
                if (args.fingerprint) {
                    void query.where(
                        `${AiAgentTurnSignalTableName}.fingerprint`,
                        args.fingerprint,
                    );
                }
                if (args.statuses) {
                    void query
                        .leftJoin(
                            AiAgentReviewItemTableName,
                            function joinReviewItems() {
                                this.on(
                                    `${AiAgentReviewItemTableName}.fingerprint`,
                                    `${AiAgentTurnSignalTableName}.fingerprint`,
                                ).andOn(
                                    `${AiAgentReviewItemTableName}.organization_uuid`,
                                    `${AiAgentTurnSignalTableName}.organization_uuid`,
                                );
                            },
                        )
                        .whereRaw(
                            `COALESCE(${AiAgentReviewItemTableName}.status, 'triage') IN (${args.statuses
                                .map(() => '?')
                                .join(', ')})`,
                            args.statuses,
                        );
                }
            });

        const aggregateRows = (await baseQuery
            .clone()
            .select({
                fingerprint: `${AiAgentTurnSignalTableName}.fingerprint`,
            })
            .min({
                first_seen_at: `${AiAgentTurnSignalTableName}.created_at`,
            })
            .max({
                last_seen_at: `${AiAgentTurnSignalTableName}.created_at`,
            })
            .count({
                finding_count: '*',
            })
            .groupBy(`${AiAgentTurnSignalTableName}.fingerprint`)
            .orderBy('last_seen_at', 'desc')
            .limit(limit)) as ReviewItemAggregateRow[];

        const fingerprints = aggregateRows.map((row) => row.fingerprint);
        if (fingerprints.length === 0) {
            return [];
        }

        const latestRows = (await this.database<AiAgentTurnSignalTable>(
            AiAgentTurnSignalTableName,
        )
            .distinctOn('fingerprint')
            .select('*')
            .where('organization_uuid', args.organizationUuid)
            .whereIn('fingerprint', fingerprints)
            .modify((query) => {
                if (args.projectUuid) {
                    void query.where('project_uuid', args.projectUuid);
                }
                if (args.agentUuid) {
                    void query.where('agent_uuid', args.agentUuid);
                }
            })
            .orderBy('fingerprint')
            .orderBy('created_at', 'desc')) as DbAiAgentTurnSignal[];

        const latestByFingerprint = new Map(
            latestRows
                .filter((row) => row.fingerprint !== null)
                .map((row) => [row.fingerprint as string, row]),
        );
        const aggregateByFingerprint = new Map(
            aggregateRows.map((row) => [row.fingerprint, row]),
        );
        const [persisted, remediationByFingerprint] = await Promise.all([
            this.getReviewItemsByFingerprint(fingerprints),
            this.getLatestReviewRemediationsByFingerprint({
                organizationUuid: args.organizationUuid,
                fingerprints,
            }),
        ]);

        // Manual board order: items with a board_position sort first (ascending);
        // the rest keep the default last-seen order. V8's stable sort preserves
        // that fallback order for nulls and ties.
        fingerprints.sort((a, b) => {
            const pa = persisted.get(a)?.board_position;
            const pb = persisted.get(b)?.board_position;
            if (pa == null && pb == null) return 0;
            if (pa == null) return 1;
            if (pb == null) return -1;
            return pa - pb;
        });

        const reviewItems = fingerprints
            .map((fingerprint): AiAgentReviewItemSummary | null => {
                const latest = latestByFingerprint.get(fingerprint);
                const aggregate = aggregateByFingerprint.get(fingerprint);
                if (!latest || !aggregate) {
                    return null;
                }
                const firstSeenAt = new Date(aggregate.first_seen_at);
                const lastSeenAt = new Date(aggregate.last_seen_at);
                const item = persisted.get(fingerprint) ?? null;
                const remediation =
                    remediationByFingerprint.get(fingerprint) ?? null;
                const writebackStale =
                    item !== null &&
                    isStaleWritebackStatus(
                        item.pr_writeback_status,
                        item.updated_at_age_ms,
                    );
                return {
                    uuid: fingerprint,
                    fingerprint,
                    organizationUuid: latest.organization_uuid,
                    projectUuid: latest.project_uuid,
                    agentUuid: latest.agent_uuid,
                    title: latest.review_item_title ?? 'Review AI agent issue',
                    description: latest.review_item_description ?? '',
                    primaryRootCause: latest.primary_root_cause ?? 'ambiguous',
                    status: item?.status ?? 'triage',
                    dismissedReason: item?.dismissed_reason ?? null,
                    ownerType: latest.owner_type ?? 'unknown',
                    assignedToUserUuid: item?.assigned_to_user_uuid ?? null,
                    firstSeenAt,
                    lastSeenAt,
                    findingCount: Number(aggregate.finding_count),
                    statusUpdatedAt: item?.status_updated_at ?? lastSeenAt,
                    statusUpdatedByUserUuid:
                        item?.status_updated_by_user_uuid ?? null,
                    linkedIssueUrl: item?.linked_issue_url ?? null,
                    linkedPrUrl: item?.linked_pr_url ?? null,
                    prState: item?.pr_state ?? null,
                    prWritebackStatus: writebackStale
                        ? 'failed'
                        : (item?.pr_writeback_status ?? null),
                    prWritebackMessage: writebackStale
                        ? WRITEBACK_TIMED_OUT_MESSAGE
                        : (item?.pr_writeback_message ?? null),
                    boardPosition: item?.board_position ?? null,
                    writebackEligible: false,
                    writebackEligibility: defaultWritebackEligibility,
                    remediation,
                    createdAt: item?.created_at ?? firstSeenAt,
                    updatedAt: item?.updated_at ?? lastSeenAt,
                    latestFinding: {
                        uuid: latest.ai_agent_review_turn_signal_uuid,
                        promptUuid: latest.ai_prompt_uuid,
                        threadUuid: latest.ai_thread_uuid,
                        projectUuid: latest.project_uuid,
                        agentUuid: latest.agent_uuid,
                        subcategories: latest.subcategories ?? [],
                        fixTargets: latest.fix_targets ?? [],
                        targetRefs: latest.target_refs ?? [],
                        evidenceExcerpts: latest.evidence_excerpts ?? [],
                        recommendation: latest.recommendation,
                        projectContextEntry:
                            latest.project_context_entry ?? null,
                        createdAt: latest.created_at,
                    },
                };
            })
            .filter(
                (reviewItem): reviewItem is AiAgentReviewItemSummary =>
                    reviewItem !== null,
            );

        return reviewItems;
    }

    async getReviewItemsByFingerprint(
        fingerprints: string[],
    ): Promise<Map<string, ReviewItemRow>> {
        if (fingerprints.length === 0) {
            return new Map();
        }
        const items = (await this.database<AiAgentReviewItemTable>(
            AiAgentReviewItemTableName,
        )
            .whereIn('fingerprint', fingerprints)
            .select<ReviewItemRow[]>(
                '*',
                this.database.raw(
                    '(extract(epoch from (now() - updated_at)) * 1000)::float8 as updated_at_age_ms',
                ),
            )) as ReviewItemRow[];
        return new Map(items.map((item) => [item.fingerprint, item]));
    }

    async getLatestReviewRemediationsByFingerprint(args: {
        organizationUuid: string;
        fingerprints: string[];
    }): Promise<Map<string, AiAgentReviewRemediation>> {
        if (args.fingerprints.length === 0) {
            return new Map();
        }

        const rows = (await this.database<AiAgentReviewRemediationTable>(
            `${AiAgentReviewRemediationTableName} as remediation`,
        )
            .leftJoin(
                `${PullRequestsTableName} as pull_request`,
                'pull_request.pull_request_uuid',
                'remediation.pull_request_uuid',
            )
            .where('remediation.organization_uuid', args.organizationUuid)
            .whereIn('remediation.fingerprint', args.fingerprints)
            .select<ReviewRemediationRow[]>(
                'remediation.*',
                {
                    linked_pr_url: 'pull_request.pr_url',
                },
                this.database.raw(
                    '(extract(epoch from (now() - remediation.updated_at)) * 1000)::float8 as updated_at_age_ms',
                ),
            )
            .orderBy('remediation.fingerprint')
            .orderByRaw(
                `CASE WHEN remediation.status IN (${ACTIVE_REMEDIATION_STATUSES.map(
                    () => '?',
                ).join(', ')}) THEN 0 ELSE 1 END`,
                ACTIVE_REMEDIATION_STATUSES,
            )
            .orderBy(
                'remediation.updated_at',
                'desc',
            )) as ReviewRemediationRow[];

        const remediations = new Map<string, AiAgentReviewRemediation>();
        rows.forEach((row) => {
            if (!remediations.has(row.fingerprint)) {
                remediations.set(row.fingerprint, mapReviewRemediation(row));
            }
        });
        return remediations;
    }

    /**
     * Writeback PRs the agent itself opened in a given set of threads (via the
     * editDbtProject / runAiWriteback tools). Used to warn the judge and to block
     * remediation from opening a second PR on a thread that already has one.
     */
    async getThreadWritebackPullRequests(
        threadUuids: string[],
    ): Promise<Map<string, { prUrl: string | null; createdAt: Date }[]>> {
        if (threadUuids.length === 0) {
            return new Map();
        }

        const rows = await this.database(
            `${AiWritebackThreadTableName} as writeback`,
        )
            .leftJoin(
                `${PullRequestsTableName} as pull_request`,
                'pull_request.pull_request_uuid',
                'writeback.pull_request_uuid',
            )
            .whereIn('writeback.ai_thread_uuid', threadUuids)
            .whereNotNull('writeback.pull_request_uuid')
            .select<
                {
                    ai_thread_uuid: string;
                    pr_url: string | null;
                    created_at: Date;
                }[]
            >(
                'writeback.ai_thread_uuid',
                { pr_url: 'pull_request.pr_url' },
                { created_at: 'writeback.created_at' },
            )
            .orderBy('writeback.created_at', 'desc');

        const byThread = new Map<
            string,
            { prUrl: string | null; createdAt: Date }[]
        >();
        rows.forEach((row) => {
            const existing = byThread.get(row.ai_thread_uuid) ?? [];
            existing.push({ prUrl: row.pr_url, createdAt: row.created_at });
            byThread.set(row.ai_thread_uuid, existing);
        });
        return byThread;
    }

    async getReviewRemediation(args: {
        organizationUuid: string;
        remediationUuid: string;
    }): Promise<AiAgentReviewRemediation | null> {
        const row = (await this.database<AiAgentReviewRemediationTable>(
            `${AiAgentReviewRemediationTableName} as remediation`,
        )
            .leftJoin(
                `${PullRequestsTableName} as pull_request`,
                'pull_request.pull_request_uuid',
                'remediation.pull_request_uuid',
            )
            .where('remediation.organization_uuid', args.organizationUuid)
            .where(
                'remediation.ai_agent_review_remediation_uuid',
                args.remediationUuid,
            )
            .select<ReviewRemediationRow>(
                'remediation.*',
                {
                    linked_pr_url: 'pull_request.pr_url',
                },
                this.database.raw(
                    '(extract(epoch from (now() - remediation.updated_at)) * 1000)::float8 as updated_at_age_ms',
                ),
            )
            .first()) as ReviewRemediationRow | undefined;

        return row ? mapReviewRemediation(row) : null;
    }

    async findReviewRemediationByPreviewThread(args: {
        organizationUuid: string;
        previewThreadUuid: string;
    }): Promise<AiAgentReviewRemediation | null> {
        const row = (await this.database<AiAgentReviewRemediationTable>(
            `${AiAgentReviewRemediationTableName} as remediation`,
        )
            .leftJoin(
                `${PullRequestsTableName} as pull_request`,
                'pull_request.pull_request_uuid',
                'remediation.pull_request_uuid',
            )
            .where('remediation.organization_uuid', args.organizationUuid)
            .where('remediation.preview_thread_uuid', args.previewThreadUuid)
            .orderBy('remediation.updated_at', 'desc')
            .select<ReviewRemediationRow>(
                'remediation.*',
                {
                    linked_pr_url: 'pull_request.pr_url',
                },
                this.database.raw(
                    '(extract(epoch from (now() - remediation.updated_at)) * 1000)::float8 as updated_at_age_ms',
                ),
            )
            .first()) as ReviewRemediationRow | undefined;

        return row ? mapReviewRemediation(row) : null;
    }

    async findReviewRemediationByWorkThread(args: {
        organizationUuid: string;
        workThreadUuid: string;
    }): Promise<AiAgentReviewRemediation | null> {
        const row = (await this.database<AiAgentReviewRemediationTable>(
            `${AiAgentReviewRemediationTableName} as remediation`,
        )
            .leftJoin(
                `${PullRequestsTableName} as pull_request`,
                'pull_request.pull_request_uuid',
                'remediation.pull_request_uuid',
            )
            .where('remediation.organization_uuid', args.organizationUuid)
            .where('remediation.work_thread_uuid', args.workThreadUuid)
            .orderBy('remediation.updated_at', 'desc')
            .select<ReviewRemediationRow>(
                'remediation.*',
                {
                    linked_pr_url: 'pull_request.pr_url',
                },
                this.database.raw(
                    '(extract(epoch from (now() - remediation.updated_at)) * 1000)::float8 as updated_at_age_ms',
                ),
            )
            .first()) as ReviewRemediationRow | undefined;

        return row ? mapReviewRemediation(row) : null;
    }

    async createReviewRemediation(
        args: CreateReviewRemediationArgs,
    ): Promise<AiAgentReviewRemediation> {
        const [row] = await this.database<AiAgentReviewRemediationTable>(
            AiAgentReviewRemediationTableName,
        )
            .insert({
                fingerprint: args.fingerprint,
                organization_uuid: args.organizationUuid,
                source_ai_agent_review_turn_signal_uuid: args.sourceFindingUuid,
                source_prompt_uuid: args.sourcePromptUuid,
                source_thread_uuid: args.sourceThreadUuid,
                source_project_uuid: args.sourceProjectUuid,
                source_agent_uuid: args.sourceAgentUuid,
                work_thread_uuid: args.workThreadUuid,
                retry_prompt: args.retryPrompt,
                created_by_user_uuid: args.createdByUserUuid,
            })
            .returning('*');

        return mapReviewRemediation({
            ...row,
            linked_pr_url: null,
            updated_at_age_ms: 0,
        });
    }

    async setReviewRemediationWorkThread(args: {
        remediationUuid: string;
        organizationUuid: string;
        workThreadUuid: string;
    }): Promise<void> {
        await this.database<AiAgentReviewRemediationTable>(
            AiAgentReviewRemediationTableName,
        )
            .where('ai_agent_review_remediation_uuid', args.remediationUuid)
            .where('organization_uuid', args.organizationUuid)
            .update({
                work_thread_uuid: args.workThreadUuid,
                updated_at: this.database.fn.now() as never,
            });
    }

    async updateReviewRemediationStatus(
        args: UpdateReviewRemediationStatusArgs,
    ): Promise<void> {
        const updatedCount = await this.database<AiAgentReviewRemediationTable>(
            AiAgentReviewRemediationTableName,
        )
            .where('ai_agent_review_remediation_uuid', args.remediationUuid)
            .where('organization_uuid', args.organizationUuid)
            .update({
                status: args.status,
                error_message: args.errorMessage ?? null,
                resolved_by_user_uuid:
                    args.status === 'resolved'
                        ? (args.resolvedByUserUuid ?? null)
                        : null,
                resolved_at:
                    args.status === 'resolved'
                        ? (this.database.fn.now() as never)
                        : null,
                updated_at: this.database.fn.now() as never,
            });

        // Terminal transitions emit activity events centrally so no call site
        // can forget; moment events (pr_opened, preview_compiled, …) are
        // written by the services where the moment happens.
        if (updatedCount === 0) {
            return;
        }
        if (args.status === 'resolved') {
            await this.createRemediationEvent({
                remediationUuid: args.remediationUuid,
                organizationUuid: args.organizationUuid,
                event: { eventType: 'resolved', payload: {} },
                createdByUserUuid: args.resolvedByUserUuid ?? null,
            });
        } else if (args.status === 'failed') {
            await this.createRemediationEvent({
                remediationUuid: args.remediationUuid,
                organizationUuid: args.organizationUuid,
                event: {
                    eventType: 'failed',
                    payload: { errorMessage: args.errorMessage ?? null },
                },
            });
        }
    }

    async createRemediationEvent(args: {
        remediationUuid: string;
        organizationUuid: string;
        event: AiAgentReviewRemediationEventDetail;
        occurredAt?: Date;
        createdByUserUuid?: string | null;
    }): Promise<void> {
        await this.database<AiAgentReviewRemediationEventsTable>(
            AiAgentReviewRemediationEventsTableName,
        ).insert({
            ai_agent_review_remediation_uuid: args.remediationUuid,
            organization_uuid: args.organizationUuid,
            event_type: args.event.eventType,
            payload: args.event.payload,
            occurred_at: args.occurredAt ?? (this.database.fn.now() as never),
            created_by_user_uuid: args.createdByUserUuid ?? null,
        });
    }

    async listRemediationEvents(args: {
        remediationUuid: string;
        organizationUuid: string;
    }): Promise<AiAgentReviewRemediationEvent[]> {
        const rows = await this.database<AiAgentReviewRemediationEventsTable>(
            AiAgentReviewRemediationEventsTableName,
        )
            .where('ai_agent_review_remediation_uuid', args.remediationUuid)
            .where('organization_uuid', args.organizationUuid)
            .orderBy('occurred_at', 'asc')
            .select('*');

        return rows.map(AiAgentReviewClassifierModel.mapRemediationEvent);
    }

    private static mapRemediationEvent(
        row: DbAiAgentReviewRemediationEvent,
    ): AiAgentReviewRemediationEvent {
        return {
            uuid: row.ai_agent_review_remediation_event_uuid,
            remediationUuid: row.ai_agent_review_remediation_uuid,
            occurredAt: row.occurred_at,
            createdByUserUuid: row.created_by_user_uuid,
            eventType: row.event_type,
            payload: row.payload,
        } as AiAgentReviewRemediationEvent;
    }

    /**
     * Persists a stale (queued/running past WRITEBACK_STALE_MS) remediation as
     * failed so the one-active-per-fingerprint index allows a retry. The age
     * check runs in SQL against the DB clock, so it agrees with the stale
     * presentation in mapReviewRemediation. No-op when the remediation is
     * still fresh or already terminal.
     */
    async failStaleReviewRemediation(args: {
        remediationUuid: string;
        organizationUuid: string;
    }): Promise<void> {
        await this.database<AiAgentReviewRemediationTable>(
            AiAgentReviewRemediationTableName,
        )
            .where('ai_agent_review_remediation_uuid', args.remediationUuid)
            .where('organization_uuid', args.organizationUuid)
            .whereIn('status', ['queued', 'running'])
            .whereRaw('updated_at < now() - make_interval(secs => ?)', [
                WRITEBACK_STALE_MS / 1000,
            ])
            .update({
                status: 'failed',
                error_message: WRITEBACK_TIMED_OUT_MESSAGE,
                updated_at: this.database.fn.now() as never,
            });
    }

    async setReviewRemediationPullRequest(
        args: SetReviewRemediationPullRequestArgs,
    ): Promise<void> {
        await this.database<AiAgentReviewRemediationTable>(
            AiAgentReviewRemediationTableName,
        )
            .where('ai_agent_review_remediation_uuid', args.remediationUuid)
            .where('organization_uuid', args.organizationUuid)
            .update({
                pull_request_uuid: args.pullRequestUuid,
                status: 'pr_open',
                error_message: null,
                updated_at: this.database.fn.now() as never,
            });
    }

    async setReviewRemediationPreview(
        args: SetReviewRemediationPreviewArgs,
    ): Promise<void> {
        await this.database<AiAgentReviewRemediationTable>(
            AiAgentReviewRemediationTableName,
        )
            .where('ai_agent_review_remediation_uuid', args.remediationUuid)
            .where('organization_uuid', args.organizationUuid)
            .update({
                preview_project_uuid: args.previewProjectUuid,
                preview_agent_uuid: args.previewAgentUuid,
                status: 'preview_ready',
                error_message: null,
                updated_at: this.database.fn.now() as never,
            });
    }

    async setReviewRemediationPreviewThread(
        args: SetReviewRemediationPreviewThreadArgs,
    ): Promise<void> {
        await this.database<AiAgentReviewRemediationTable>(
            AiAgentReviewRemediationTableName,
        )
            .where('ai_agent_review_remediation_uuid', args.remediationUuid)
            .where('organization_uuid', args.organizationUuid)
            .update({
                preview_project_uuid: args.previewProjectUuid,
                preview_agent_uuid: args.previewAgentUuid,
                preview_thread_uuid: args.previewThreadUuid,
                status: 'preview_ready',
                error_message: null,
                updated_at: this.database.fn.now() as never,
            });
    }

    async getReviewItem(
        organizationUuid: string,
        fingerprint: string,
    ): Promise<AiAgentReviewItemSummary | null> {
        const items = await this.listReviewItems({
            organizationUuid,
            fingerprint,
        });
        return items[0] ?? null;
    }

    async getPromptText(args: GetPromptTextArgs): Promise<string | null> {
        const row = await this.database(`${AiPromptTableName} as prompt`)
            .join(
                `${AiThreadTableName} as thread`,
                'thread.ai_thread_uuid',
                'prompt.ai_thread_uuid',
            )
            .where('thread.organization_uuid', args.organizationUuid)
            .where('prompt.ai_prompt_uuid', args.promptUuid)
            .first<{ prompt: string }>('prompt.prompt');

        return row?.prompt ?? null;
    }

    async getPromotedFingerprintScope(
        organizationUuid: string,
        fingerprint: string,
    ): Promise<{ projectUuid: string; agentUuid: string } | null> {
        const row = await this.database<AiAgentTurnSignalTable>(
            AiAgentTurnSignalTableName,
        )
            .where('organization_uuid', organizationUuid)
            .where('fingerprint', fingerprint)
            .where('promoted_to_finding', true)
            .orderBy('created_at', 'desc')
            .first('project_uuid', 'agent_uuid');
        if (!row) {
            return null;
        }
        return { projectUuid: row.project_uuid, agentUuid: row.agent_uuid };
    }

    async upsertReviewItemState(
        args: UpsertReviewItemStateArgs,
    ): Promise<void> {
        await this.database<AiAgentReviewItemTable>(AiAgentReviewItemTableName)
            .insert({
                fingerprint: args.fingerprint,
                organization_uuid: args.organizationUuid,
                project_uuid: args.projectUuid,
                agent_uuid: args.agentUuid,
                status: args.status,
                dismissed_reason: args.dismissedReason,
                status_updated_at: this.database.fn.now() as never,
                status_updated_by_user_uuid: args.statusUpdatedByUserUuid,
                ...(args.boardPosition !== undefined
                    ? { board_position: args.boardPosition }
                    : {}),
            })
            .onConflict('fingerprint')
            .merge({
                status: args.status,
                dismissed_reason: args.dismissedReason,
                status_updated_at: this.database.fn.now(),
                status_updated_by_user_uuid: args.statusUpdatedByUserUuid,
                updated_at: this.database.fn.now(),
                ...(args.boardPosition !== undefined
                    ? { board_position: args.boardPosition }
                    : {}),
            });
    }

    // Persists the board order for a lane: board_position = array index for each
    // item, in a single transaction so a mid-list failure can't leave the lane
    // half-reordered. Sets only the sort key (status/assignee/timestamps stay)
    // and inserts a triage-status row for items never acted on (so a
    // never-triaged card can still be ordered).
    async setReviewItemBoardPositions(args: {
        organizationUuid: string;
        items: { fingerprint: string; projectUuid: string; agentUuid: string }[];
    }): Promise<void> {
        if (args.items.length === 0) return;
        await this.database.transaction(async (trx) => {
            await Promise.all(
                args.items.map((item, index) =>
                    trx<AiAgentReviewItemTable>(AiAgentReviewItemTableName)
                        .insert({
                            fingerprint: item.fingerprint,
                            organization_uuid: args.organizationUuid,
                            project_uuid: item.projectUuid,
                            agent_uuid: item.agentUuid,
                            status: 'triage',
                            board_position: index,
                        })
                        .onConflict('fingerprint')
                        .merge({
                            board_position: index,
                            updated_at: trx.fn.now(),
                        }),
                ),
            );
        });
    }

    async updateReviewItemAssignee(args: {
        fingerprint: string;
        organizationUuid: string;
        assignedToUserUuid: string | null;
    }): Promise<void> {
        await this.database<AiAgentReviewItemTable>(AiAgentReviewItemTableName)
            .where('fingerprint', args.fingerprint)
            .where('organization_uuid', args.organizationUuid)
            .update({
                assigned_to_user_uuid: args.assignedToUserUuid,
                updated_at: this.database.fn.now() as never,
            });
    }

    async setReviewItemPrLink(args: {
        fingerprint: string;
        organizationUuid: string;
        projectUuid: string;
        agentUuid: string;
        linkedPrUrl: string;
        prState: AiAgentReviewItemPrState;
    }): Promise<void> {
        await this.database<AiAgentReviewItemTable>(AiAgentReviewItemTableName)
            .insert({
                fingerprint: args.fingerprint,
                organization_uuid: args.organizationUuid,
                project_uuid: args.projectUuid,
                agent_uuid: args.agentUuid,
                linked_pr_url: args.linkedPrUrl,
                pr_state: args.prState,
            })
            .onConflict('fingerprint')
            .merge({
                linked_pr_url: args.linkedPrUrl,
                pr_state: args.prState,
                updated_at: this.database.fn.now(),
            });
    }

    async setReviewItemWritebackStatus(args: {
        fingerprint: string;
        organizationUuid: string;
        projectUuid: string;
        agentUuid: string;
        status: AiAgentReviewItemWritebackStatus;
        message: string | null;
    }): Promise<void> {
        await this.database<AiAgentReviewItemTable>(AiAgentReviewItemTableName)
            .insert({
                fingerprint: args.fingerprint,
                organization_uuid: args.organizationUuid,
                project_uuid: args.projectUuid,
                agent_uuid: args.agentUuid,
                pr_writeback_status: args.status,
                pr_writeback_message: args.message,
            })
            .onConflict('fingerprint')
            .merge({
                pr_writeback_status: args.status,
                pr_writeback_message: args.message,
                updated_at: this.database.fn.now(),
            });
    }

    async updateReviewItemWritebackProgress(args: {
        fingerprint: string;
        organizationUuid: string;
        message: string;
    }): Promise<void> {
        // Guarded so a late, fire-and-forget progress write can never resurrect
        // a row that already reached a terminal (completed/failed) state.
        await this.database<AiAgentReviewItemTable>(AiAgentReviewItemTableName)
            .where('fingerprint', args.fingerprint)
            .where('organization_uuid', args.organizationUuid)
            .whereNotIn('pr_writeback_status', ['completed', 'failed'])
            .update({
                pr_writeback_status: 'running',
                pr_writeback_message: args.message,
                updated_at: this.database.fn.now() as never,
            });
    }

    async failReviewItemWriteback(args: {
        fingerprint: string;
        organizationUuid: string;
        message: string;
    }): Promise<void> {
        await this.database<AiAgentReviewItemTable>(AiAgentReviewItemTableName)
            .where('fingerprint', args.fingerprint)
            .where('organization_uuid', args.organizationUuid)
            .whereIn('pr_writeback_status', ['queued', 'running'])
            .update({
                pr_writeback_status: 'failed',
                pr_writeback_message: args.message,
                updated_at: this.database.fn.now() as never,
            });
    }

    async reconcileReviewItemPrState(args: {
        fingerprint: string;
        organizationUuid: string;
        status: AiAgentReviewItemStatus;
        prState: AiAgentReviewItemPrState;
    }): Promise<void> {
        await this.database<AiAgentReviewItemTable>(AiAgentReviewItemTableName)
            .where('fingerprint', args.fingerprint)
            .where('organization_uuid', args.organizationUuid)
            .update({
                status: args.status,
                pr_state: args.prState,
                status_updated_at: this.database.fn.now() as never,
                updated_at: this.database.fn.now() as never,
            });
    }

    async listReviewSignals(
        args: ListReviewSignalsArgs,
    ): Promise<AiAgentReviewSignalSummary[]> {
        const rows = await this.database(
            `${AiAgentTurnSignalTableName} as signal`,
        )
            .join(
                `${AiAgentReviewClassifierRunTableName} as run`,
                'run.ai_agent_review_run_uuid',
                'signal.ai_agent_review_run_uuid',
            )
            .join(
                `${AiPromptTableName} as prompt`,
                'prompt.ai_prompt_uuid',
                'signal.ai_prompt_uuid',
            )
            .select<ReviewSignalSummaryRow[]>({
                ai_agent_review_turn_signal_uuid:
                    'signal.ai_agent_review_turn_signal_uuid',
                ai_agent_review_run_uuid: 'signal.ai_agent_review_run_uuid',
                ai_prompt_uuid: 'signal.ai_prompt_uuid',
                ai_thread_uuid: 'signal.ai_thread_uuid',
                project_uuid: 'signal.project_uuid',
                agent_uuid: 'signal.agent_uuid',
                signal: 'signal.signal',
                implicit_signal_sources: 'signal.implicit_signal_sources',
                confidence: 'signal.confidence',
                promoted_to_finding: 'signal.promoted_to_finding',
                promotion_reason: 'signal.promotion_reason',
                signal_created_at: 'signal.created_at',
                run_scope: 'run.run_scope',
                prompt: 'prompt.prompt',
                response: 'prompt.response',
                error_message: 'prompt.error_message',
                fingerprint: 'signal.fingerprint',
                primary_root_cause: 'signal.primary_root_cause',
                subcategories: 'signal.subcategories',
                fix_targets: 'signal.fix_targets',
                target_refs: 'signal.target_refs',
                evidence_excerpts: 'signal.evidence_excerpts',
                recommendation: 'signal.recommendation',
            })
            .where('signal.organization_uuid', args.organizationUuid)
            .modify((query) => {
                if (args.projectUuid) {
                    void query.where('signal.project_uuid', args.projectUuid);
                }
                if (args.agentUuid) {
                    void query.where('signal.agent_uuid', args.agentUuid);
                }
            })
            .orderBy('signal.created_at', 'desc')
            .limit(Math.min(args.limit ?? 100, 500));

        return rows.map(AiAgentReviewClassifierModel.mapReviewSignalSummary);
    }

    async createTurnSignal(args: CreateTurnSignalArgs): Promise<string> {
        const { finding, turnSignal } = args;
        const promptUuid = turnSignal.subject.assistantPromptUuid;
        const newFingerprint =
            turnSignal.promotedToFinding && finding
                ? finding.reviewItem.fingerprint
                : null;

        return this.database.transaction(async (trx) => {
            // Serialize reviews of the same turn. A re-review (a feedback change,
            // or the next turn supplying a correction) supersedes the prior
            // signal with a delete+insert. Without this lock two concurrent
            // reviews of the same turn can interleave so the loser's signal — and
            // the review item it created — are clobbered and orphaned. The lock
            // is transaction-scoped and released on commit/rollback.
            await trx.raw(
                'select pg_advisory_xact_lock(hashtextextended(?, 0))',
                [promptUuid],
            );

            // Capture the fingerprints we're about to supersede so we can
            // reconcile any review item left without a backing signal.
            const supersededRows = await trx(AiAgentTurnSignalTableName)
                .where('ai_prompt_uuid', promptUuid)
                .whereNotNull('fingerprint')
                .distinct('fingerprint');
            const supersededFingerprints = supersededRows
                .map((r) => r.fingerprint as string | null)
                .filter((fp): fp is string => fp !== null);

            // Supersede: keep one current signal per turn. A re-review (once a
            // later turn supplies the correction) replaces the earlier judgment
            // instead of stacking a second signal — so the queue shows the
            // latest verdict and findingCount counts distinct turns, not
            // re-reviews of the same turn.
            await trx(AiAgentTurnSignalTableName)
                .where('ai_prompt_uuid', promptUuid)
                .delete();
            const inserted = await trx<AiAgentTurnSignalTable>(
                AiAgentTurnSignalTableName,
            )
                .insert({
                    ai_agent_review_run_uuid: args.runUuid,
                    ai_prompt_uuid: turnSignal.subject.assistantPromptUuid,
                    ai_thread_uuid: turnSignal.subject.threadUuid,
                    organization_uuid: turnSignal.subject.organizationUuid,
                    project_uuid: turnSignal.subject.projectUuid,
                    agent_uuid: turnSignal.subject.agentUuid,
                    interaction_source: turnSignal.interactionSource,
                    source_ref: this.jsonb(turnSignal.sourceRef) as never,
                    signal: turnSignal.signal,
                    implicit_signal_sources: this.jsonb(
                        turnSignal.implicitSignalSources,
                    ) as never,
                    confidence: turnSignal.confidence,
                    promoted_to_finding: turnSignal.promotedToFinding,
                    promotion_reason: turnSignal.promotionReason,
                    tool_evidence_refs: this.jsonb(
                        turnSignal.toolEvidenceRefs,
                    ) as never,
                    fingerprint: finding?.reviewItem.fingerprint,
                    primary_root_cause: finding?.primaryRootCause,
                    secondary_root_causes: finding
                        ? (this.jsonb(finding.secondaryRootCauses) as never)
                        : null,
                    subcategories: finding
                        ? (this.jsonb(finding.subcategories) as never)
                        : null,
                    fix_targets: finding
                        ? (this.jsonb(finding.fixTargets) as never)
                        : null,
                    target_refs: finding
                        ? (this.jsonb(finding.targetRefs) as never)
                        : null,
                    evidence_excerpts: finding
                        ? (this.jsonb(finding.evidenceExcerpts) as never)
                        : null,
                    recommendation: finding
                        ? (this.jsonb(finding.recommendation) as never)
                        : null,
                    project_context_entry: finding
                        ? (this.jsonb(finding.projectContextEntry) as never)
                        : null,
                    owner_type: finding?.reviewItem.ownerType,
                    review_item_title: finding?.reviewItem.title,
                    review_item_description: finding?.reviewItem.description,
                    runtime_context_snapshot: this.jsonb(
                        turnSignal.runtimeContextSnapshot,
                    ) as never,
                    model_metadata: this.jsonb(
                        turnSignal.modelMetadata,
                    ) as never,
                })
                .returning('ai_agent_review_turn_signal_uuid');

            // Write the review item in the same transaction so a signal and the
            // item it promotes are always created together.
            if (newFingerprint) {
                await trx<AiAgentReviewItemTable>(AiAgentReviewItemTableName)
                    .insert({
                        fingerprint: newFingerprint,
                        organization_uuid: turnSignal.subject.organizationUuid,
                        project_uuid: turnSignal.subject.projectUuid,
                        agent_uuid: turnSignal.subject.agentUuid,
                    })
                    .onConflict('fingerprint')
                    .merge({ updated_at: trx.fn.now() });
            }

            // Reconcile: a superseded finding can leave its review item with no
            // backing signal. Drop such orphans, but only while still pristine —
            // an item a human has triaged (assigned, linked, status changed) is
            // kept so manual work is never discarded.
            const orphanCandidates = supersededFingerprints.filter(
                (fp) => fp !== newFingerprint,
            );
            if (orphanCandidates.length > 0) {
                const stillReferencedRows = await trx(
                    AiAgentTurnSignalTableName,
                )
                    .whereIn('fingerprint', orphanCandidates)
                    .distinct('fingerprint');
                const stillReferenced = new Set(
                    stillReferencedRows.map((r) => r.fingerprint),
                );
                const orphaned = orphanCandidates.filter(
                    (fp) => !stillReferenced.has(fp),
                );
                if (orphaned.length > 0) {
                    await trx(AiAgentReviewItemTableName)
                        .whereIn('fingerprint', orphaned)
                        .whereIn('status', ['triage', 'open'])
                        .whereNull('assigned_to_user_uuid')
                        .whereNull('linked_issue_url')
                        .whereNull('linked_pr_url')
                        .whereNull('pr_writeback_thread_uuid')
                        .whereNull('status_updated_by_user_uuid')
                        .delete();
                }
            }

            return inserted[0].ai_agent_review_turn_signal_uuid;
        });
    }
}
