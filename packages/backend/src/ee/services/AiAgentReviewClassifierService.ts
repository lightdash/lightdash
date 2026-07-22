/* eslint-disable @typescript-eslint/no-use-before-define */
import {
    aiAgentReviewClassifierJudgeOutputSchema,
    assertUnreachable,
    CatalogType,
    filterExploreByTags,
    ForbiddenError,
    getAiAgentConfigSnapshotHash,
    getAiAgentReviewItemFingerprint,
    isExploreError,
    ProjectType,
    type AiAgentAvailableCapability,
    type AiAgentConfigSnapshot,
    type AiAgentConfigurationSetting,
    type AiAgentEvidenceExcerpt,
    type AiAgentKnowledgeDocumentSnapshot,
    type AiAgentMcpServerSnapshot,
    type AiAgentReviewClassifierEventType,
    type AiAgentReviewClassifierJudgeOutput,
    type AiAgentReviewClassifierRunScope,
    type AiAgentReviewClassifierSignalFinding,
    type AiAgentReviewClassifierToolOutcome,
    type AiAgentReviewClassifierTurnCandidate,
    type AiAgentReviewClassifierTurnSignal,
    type AiAgentReviewItemDedupCandidate,
    type AiAgentRootCause,
    type AiAgentTargetRef,
    type AiAgentTurnSignal,
    type CatalogItemSummary,
    type Explore,
    type QueryHistoryStatus,
} from '@lightdash/common';
import { generateObject } from 'ai';
import { createHash } from 'crypto';
import {
    emitAiUsage,
    languageModelUsageToTokens,
} from '../../analytics/aiUsage';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { type CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../../services/BaseService';
import { type AiAgentDocumentModel } from '../models/AiAgentDocumentModel';
import { type AiAgentModel } from '../models/AiAgentModel';
import { type AiAgentReviewClassifierModel } from '../models/AiAgentReviewClassifierModel';
import { type AiOrganizationSettingsModel } from '../models/AiOrganizationSettingsModel';
import { defaultAgentOptions } from './ai/agents/agentV2';
import { getModel } from './ai/models';
import { OrgAiCopilotConfigResolver } from './ai/OrgAiCopilotConfigResolver';
import {
    getAiCallTelemetry,
    getLanguageModelAttribution,
} from './ai/utils/aiCallTelemetry';
import { type AiAgentReviewNotificationService } from './AiAgentReviewNotificationService';
import { areReviewsEnabledForSettings } from './AiOrganizationSettingsService';

const REVIEW_AGENT_VERSION = 'llm-judge-v1';
const JUDGE_PROMPT_HASH = 'ai-agent-review-judge-v15';
const WRITEBACK_TOOL_NAMES = new Set([
    'editDbtProject',
    'propose_writeback',
    'runAiWriteback',
    'run_ai_writeback',
]);
const SUCCESSFUL_WRITEBACK_RESULT_PATTERN =
    /\b(opened|updated) a pull request\b/i;
const NON_ACTIONABLE_WRITEBACK_RESULT_PATTERN =
    /no pull request was opened|made no file changes|error running ai writeback/i;

/**
 * Provider for the review judge. Prefer Anthropic (Claude) when it is configured
 * — it follows the project_context vs semantic_layer routing far more reliably
 * than other providers. Returns undefined to fall back to the org's default
 * provider, so EE orgs that have an EE license but no Anthropic key (OpenAI /
 * Azure only) keep working.
 */
export const resolveReviewJudgeProvider = (
    copilot: LightdashConfig['ai']['copilot'],
): LightdashConfig['ai']['copilot']['defaultProvider'] | undefined =>
    copilot.providers.anthropic ? 'anthropic' : undefined;

type AiAgentReviewClassifierJudge = (
    candidate: AiAgentReviewClassifierTurnCandidate,
    evidencePacket: AiAgentReviewJudgeEvidencePacket,
) => Promise<AiAgentReviewClassifierJudgeOutput>;

type AiAgentReviewClassifierJudgeTargetRef =
    AiAgentReviewClassifierJudgeOutput['targetRefs'][number];

type AiAgentReviewClassifierServiceDependencies = {
    aiAgentReviewClassifierModel: AiAgentReviewClassifierModel;
    aiAgentModel: AiAgentModel;
    aiAgentDocumentModel: Pick<AiAgentDocumentModel, 'findAllForAgent'>;
    aiOrganizationSettingsModel: AiOrganizationSettingsModel;
    orgAiCopilotConfigResolver: OrgAiCopilotConfigResolver;
    catalogModel: Pick<CatalogModel, 'getCatalogItemsSummary'>;
    projectModel: Pick<ProjectModel, 'getSummary' | 'findExploresFromCache'>;
    lightdashConfig: LightdashConfig;
    aiAgentReviewNotificationService: AiAgentReviewNotificationService;
    judgeTurn?: AiAgentReviewClassifierJudge;
};

type AiAgentReviewCatalogEvidenceItem = {
    name: string;
    label: string | null;
    type: string;
    tableName: string | null;
    fieldType: string | null;
    description: string | null;
};

export type AiAgentReviewJudgeEvidencePacket = {
    subject: AiAgentReviewClassifierTurnCandidate['subject'];
    interactionSource: AiAgentReviewClassifierTurnCandidate['interactionSource'];
    targetTurn: AiAgentReviewClassifierTurnCandidate['targetTurn'];
    humanFeedback: {
        score: number | null;
        comment: string | null;
    };
    agentConfig: {
        snapshotHash: string | null;
        settings: AiAgentConfigurationSetting[];
        availableCapabilities: AiAgentAvailableCapability[];
        dataAccessEnabled: boolean | null;
        selfImprovementEnabled: boolean | null;
        contentToolsEnabled: boolean | null;
        instructionSummary: string | null;
        knowledgeDocumentCount: number;
        knowledgeDocuments: AiAgentKnowledgeDocumentSnapshot[];
        mcpServers: AiAgentMcpServerSnapshot[];
    };
    semanticContext: {
        queriedExploreNames: string[];
        queriedFieldNames: string[];
        catalogMatches: AiAgentReviewCatalogEvidenceItem[];
    };
    nextUserPrompt: {
        promptUuid: string | null;
        text: string;
    } | null;
    previousTurns: AiAgentReviewClassifierTurnCandidate['contextTurns'];
    queryHistory: {
        queryUuid: string;
        status: QueryHistoryStatus;
        error: string | null;
        metricQuery: AiAgentReviewClassifierTurnCandidate['queryHistory'][number]['metricQuery'];
        totalRowCount: number | null;
        warehouseExecutionTimeMs: number | null;
    }[];
    supportingEvidence: (AiAgentReviewClassifierTurnCandidate['supportingEvidence'][number] & {
        summary: string;
    })[];
    suggestedEvidenceExcerpts: AiAgentEvidenceExcerpt[];
    // PRs the agent already opened in this thread via writeback tools. Non-empty
    // means a real PR exists — the judge should only promote if it failed/was wrong.
    threadWritebackPullRequests: { prUrl: string | null; createdAt: Date }[];
    // Complete success/error outcome per content-mutating/writeback/preview/MCP
    // tool call in the turn — never truncated by the top-5 evidence ranking.
    toolOutcomes: AiAgentReviewClassifierToolOutcome[];
    // A human SQL-approval gate expired during the turn (user stepped away).
    pendingApprovalTimeout: boolean;
    // Existing review items in this project the judge can dedup against. Each
    // key ("item_1") maps server-side to a fingerprint never shown to the LLM.
    existingReviewItems: AiAgentReviewItemDedupCandidate[];
};

// What a tag-restricted agent can see, mirroring filterExploreByTags.
// Computed once per agent per run; null = unrestricted (no tags).
type AiAgentReviewCatalogVisibility = {
    visibleExploreNames: Set<string>;
    visibleTables: Set<string>;
    visibleFields: Set<string>;
};

type AiAgentReviewAgentConfigEvidence =
    AiAgentReviewJudgeEvidencePacket['agentConfig'] & {
        snapshot: AiAgentConfigSnapshot | null;
        agentUpdatedAt: Date | null;
        catalogVisibility: AiAgentReviewCatalogVisibility | null;
    };

type RunArgs = {
    organizationUuid: string;
    organizationName?: string;
    requestedByUserUuid?: string;
    projectUuid?: string;
    agentUuid?: string;
    startedAt: Date;
    endedAt: Date;
    limit?: number;
    dryRun?: boolean;
    persistSignals?: boolean;
    persistFindings?: boolean;
    promoteFindingsToReviewItems?: boolean;
};

type RunLiveEventArgs = {
    eventType: AiAgentReviewClassifierEventType;
    organizationUuid: string;
    organizationName?: string;
    requestedByUserUuid?: string;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    promptUuid: string;
};

type ProcessCandidatesArgs = {
    organizationUuid: string;
    organizationName?: string;
    requestedByUserUuid?: string;
    candidates: AiAgentReviewClassifierTurnCandidate[];
    runScope: AiAgentReviewClassifierRunScope;
    dryRun?: boolean;
    persistSignals?: boolean;
    persistFindings?: boolean;
    promoteFindingsToReviewItems?: boolean;
    failWhenDisabled?: boolean;
};

export type AiAgentReviewClassifierRunResult = {
    runUuid: string;
    processedTurns: number;
    signalCount: number;
    findingCount: number;
    reviewItemCount: number;
    report: AiAgentReviewClassifierExperimentReport;
};

export type AiAgentReviewClassifierExperimentReport = {
    dryRun: boolean;
    totalCandidates: number;
    signalsByType: Partial<Record<AiAgentTurnSignal, number>>;
    findingsByRootCause: Partial<Record<AiAgentRootCause, number>>;
    examples: AiAgentReviewClassifierExperimentExample[];
};

export type AiAgentReviewClassifierExperimentExample = {
    promptUuid: string;
    signal: AiAgentTurnSignal;
    rootCause: AiAgentRootCause | null;
    evidence: string[];
    queryStatuses: QueryHistoryStatus[];
    supportingEvidence: string[];
};

export type AiAgentReviewClassifierClassifiedFinding =
    AiAgentReviewClassifierSignalFinding;

export type AiAgentReviewClassifierClassifiedTurn = {
    signal: AiAgentReviewClassifierTurnSignal;
    finding: AiAgentReviewClassifierClassifiedFinding | null;
};

export type AiAgentReviewClassifierReviewedTurn = {
    candidate: AiAgentReviewClassifierTurnCandidate;
    classifiedTurn: AiAgentReviewClassifierClassifiedTurn;
};

export type AiAgentReviewJudgeReplayInput = {
    candidate: AiAgentReviewClassifierTurnCandidate;
    evidencePacket: AiAgentReviewJudgeEvidencePacket;
};

export type AiAgentReviewJudgeReplayResult =
    | { suppressed: 'writeback_in_progress'; judgeOutput: null }
    | { suppressed: null; judgeOutput: AiAgentReviewClassifierJudgeOutput };

export class AiAgentReviewClassifierService extends BaseService {
    private readonly aiAgentReviewClassifierModel: AiAgentReviewClassifierModel;

    private readonly aiAgentModel: AiAgentModel;

    private readonly aiAgentDocumentModel: Pick<
        AiAgentDocumentModel,
        'findAllForAgent'
    >;

    private readonly catalogModel: Pick<CatalogModel, 'getCatalogItemsSummary'>;

    private readonly projectModel: Pick<
        ProjectModel,
        'getSummary' | 'findExploresFromCache'
    >;

    private readonly aiOrganizationSettingsModel: AiOrganizationSettingsModel;

    private readonly orgAiCopilotConfigResolver: OrgAiCopilotConfigResolver;

    private readonly aiAgentReviewNotificationService: AiAgentReviewNotificationService;

    private readonly lightdashConfig: LightdashConfig;

    private readonly judgeTurn: AiAgentReviewClassifierJudge;

    constructor(dependencies: AiAgentReviewClassifierServiceDependencies) {
        super();
        this.aiAgentReviewClassifierModel =
            dependencies.aiAgentReviewClassifierModel;
        this.aiAgentModel = dependencies.aiAgentModel;
        this.aiAgentDocumentModel = dependencies.aiAgentDocumentModel;
        this.catalogModel = dependencies.catalogModel;
        this.projectModel = dependencies.projectModel;
        this.aiOrganizationSettingsModel =
            dependencies.aiOrganizationSettingsModel;
        this.orgAiCopilotConfigResolver =
            dependencies.orgAiCopilotConfigResolver;
        this.aiAgentReviewNotificationService =
            dependencies.aiAgentReviewNotificationService;
        this.lightdashConfig = dependencies.lightdashConfig;
        this.judgeTurn =
            dependencies.judgeTurn ??
            ((candidate, evidencePacket) =>
                this.judgeTurnWithLlm(candidate, evidencePacket));
    }

    private debugLog(context: string, payload: Record<string, unknown>): void {
        if (this.lightdashConfig.ai?.copilot?.debugLoggingEnabled === true) {
            Logger.debug(
                `[AiAgentReview][${context}] ${JSON.stringify(payload)}`,
            );
        }
    }

    async run(args: RunArgs): Promise<AiAgentReviewClassifierRunResult> {
        const candidates =
            await this.aiAgentReviewClassifierModel.listTurnReviewCandidates({
                organizationUuid: args.organizationUuid,
                projectUuid: args.projectUuid,
                agentUuid: args.agentUuid,
                startedAt: args.startedAt,
                endedAt: args.endedAt,
                limit: args.limit,
            });

        this.debugLog('BackfillCandidatesLoaded', {
            organizationUuid: args.organizationUuid,
            projectUuid: args.projectUuid,
            agentUuid: args.agentUuid,
            startedAt: args.startedAt.toISOString(),
            endedAt: args.endedAt.toISOString(),
            candidateCount: candidates?.length ?? 0,
            dryRun: !!args.dryRun,
        });

        const result = await this.processCandidates({
            organizationUuid: args.organizationUuid,
            organizationName: args.organizationName,
            requestedByUserUuid: args.requestedByUserUuid,
            candidates,
            runScope: {
                type: 'backfill',
                startedAt: args.startedAt.toISOString(),
                endedAt: args.endedAt.toISOString(),
                projectUuid: args.projectUuid,
                agentUuid: args.agentUuid,
                dryRun: !!args.dryRun,
            },
            dryRun: args.dryRun,
            persistSignals: args.persistSignals,
            persistFindings: args.persistFindings,
            promoteFindingsToReviewItems: args.promoteFindingsToReviewItems,
            failWhenDisabled: true,
        });
        if (!result) {
            throw new ForbiddenError('AI agent review agent is not enabled');
        }
        return result;
    }

    /**
     * Read-only eval surface for the replay scoreboard
     * (repl/scripts/reviewClassifierScoreboard.ts): builds the exact judge
     * inputs for one historical turn without persisting anything.
     */
    async captureJudgeReplayInput(args: {
        organizationUuid: string;
        promptUuid: string;
    }): Promise<AiAgentReviewJudgeReplayInput | null> {
        const [candidate] =
            await this.aiAgentReviewClassifierModel.listTurnReviewCandidates({
                organizationUuid: args.organizationUuid,
                promptUuid: args.promptUuid,
                limit: 1,
            });
        if (!candidate) {
            return null;
        }
        const agentConfig = await this.captureAgentConfigSnapshot(candidate);
        const { evidencePacket } = await this.buildReviewEvidence(
            candidate,
            agentConfig,
        );
        return { candidate, evidencePacket };
    }

    /**
     * Runs the judge over a captured input, applying the same pre-judge
     * writeback suppression as the live path. Never persists anything.
     */
    async replayJudge(
        input: AiAgentReviewJudgeReplayInput,
    ): Promise<AiAgentReviewJudgeReplayResult> {
        const successfulWritebackEvidence =
            AiAgentReviewClassifierService.getSuccessfulWritebackEvidence(
                input.candidate,
            );
        if (successfulWritebackEvidence) {
            return { suppressed: 'writeback_in_progress', judgeOutput: null };
        }
        const judgeOutput = await this.judgeTurn(
            input.candidate,
            input.evidencePacket,
        );
        return {
            suppressed: null,
            judgeOutput:
                AiAgentReviewClassifierService.enforceNextUserSignalGrounding(
                    judgeOutput,
                    {
                        hasNextUserPrompt:
                            input.evidencePacket.nextUserPrompt !== null,
                        hasHumanFeedback:
                            input.evidencePacket.humanFeedback.score !== null ||
                            !!input.evidencePacket.humanFeedback.comment,
                    },
                ),
        };
    }

    async runLiveEvent(
        args: RunLiveEventArgs,
    ): Promise<AiAgentReviewClassifierRunResult | null> {
        // Preview projects are scratch environments — most notably the ones
        // writeback remediation spins up to verify its own fixes. Reviewing
        // those turns would feed the reviewer's output back into itself.
        const project = await this.projectModel.getSummary(args.projectUuid);
        if (project.type === ProjectType.PREVIEW) {
            this.debugLog('LiveEventSkippedPreviewProject', {
                projectUuid: args.projectUuid,
                promptUuid: args.promptUuid,
            });
            return null;
        }

        const listCandidate = (promptUuid: string) =>
            this.aiAgentReviewClassifierModel.listTurnReviewCandidates({
                organizationUuid: args.organizationUuid,
                projectUuid: args.projectUuid,
                agentUuid: args.agentUuid,
                threadUuid: args.threadUuid,
                promptUuid,
                limit: 1,
            });

        const targetCandidates = await listCandidate(args.promptUuid);
        const candidates = [...targetCandidates];

        // When a new turn completes, re-review the immediately-preceding turn:
        // it now has this turn as its real next-user-prompt, which is where a
        // correction lives. The re-review supersedes that turn's earlier
        // standalone signal, so each turn is ultimately judged knowing what the
        // user did next — instead of guessing from the failing turn alone.
        if (args.eventType === 'response_saved') {
            const previousTurns = (
                targetCandidates[0]?.contextTurns ?? []
            ).filter((turn) => turn.relation === 'previous');
            const previousPromptUuid =
                previousTurns[previousTurns.length - 1]?.promptUuid;
            if (previousPromptUuid) {
                candidates.push(...(await listCandidate(previousPromptUuid)));
            }
        }

        this.debugLog('LiveEventCandidatesLoaded', {
            eventType: args.eventType,
            organizationUuid: args.organizationUuid,
            projectUuid: args.projectUuid,
            agentUuid: args.agentUuid,
            threadUuid: args.threadUuid,
            promptUuid: args.promptUuid,
            candidateCount: candidates.length,
        });

        return this.processCandidates({
            organizationUuid: args.organizationUuid,
            organizationName: args.organizationName,
            requestedByUserUuid: args.requestedByUserUuid,
            candidates,
            runScope: {
                type: 'live_event',
                eventType: args.eventType,
                promptUuid: args.promptUuid,
                threadUuid: args.threadUuid,
                projectUuid: args.projectUuid,
                agentUuid: args.agentUuid,
            },
            persistSignals: true,
            persistFindings: true,
            promoteFindingsToReviewItems: true,
            failWhenDisabled: false,
        });
    }

    private async processCandidates(
        args: ProcessCandidatesArgs,
    ): Promise<AiAgentReviewClassifierRunResult | null> {
        const enabled = await this.isEnabled(args);
        if (!enabled) {
            this.debugLog('SkippedDisabled', {
                organizationUuid: args.organizationUuid,
                runScope: args.runScope,
            });
            if (args.failWhenDisabled) {
                throw new ForbiddenError(
                    'AI agent review agent is not enabled',
                );
            }
            return null;
        }

        // One config per agent in the run — a multi-agent backfill must not
        // apply the first agent's tags/knowledge/MCP to other agents' turns.
        const agentConfigsByAgentUuid = new Map<
            string,
            AiAgentReviewAgentConfigEvidence
        >();
        await Promise.all(
            [
                ...new Map(
                    args.candidates.map((candidate) => [
                        candidate.subject.agentUuid,
                        candidate,
                    ]),
                ).values(),
            ].map(async (candidate) => {
                agentConfigsByAgentUuid.set(
                    candidate.subject.agentUuid,
                    await this.captureAgentConfigSnapshot(candidate),
                );
            }),
        );
        const getAgentConfig = (
            agentUuid: string,
        ): AiAgentReviewAgentConfigEvidence =>
            agentConfigsByAgentUuid.get(agentUuid) ??
            AiAgentReviewClassifierService.emptyAgentConfigEvidence();
        const runAgentConfig = args.candidates[0]
            ? getAgentConfig(args.candidates[0].subject.agentUuid)
            : AiAgentReviewClassifierService.emptyAgentConfigEvidence();

        const run = await this.aiAgentReviewClassifierModel.createRun({
            organizationUuid: args.organizationUuid,
            reviewAgentVersion: REVIEW_AGENT_VERSION,
            judgePromptHash: JUDGE_PROMPT_HASH,
            status: 'running',
            totalTurns: args.candidates.length,
            runScope: args.runScope,
            agentConfigSnapshotHash: runAgentConfig.snapshotHash,
            agentConfigSnapshot: runAgentConfig.snapshot,
            agentConfigSnapshotAgentUpdatedAt: runAgentConfig.agentUpdatedAt,
        });

        this.debugLog('RunStarted', {
            runUuid: run.uuid,
            organizationUuid: args.organizationUuid,
            runScope: args.runScope,
            agentConfigSnapshotHash: runAgentConfig.snapshotHash,
            candidateCount: args.candidates.length,
            persistSignals: args.persistSignals ?? !args.dryRun,
            persistFindings: !args.dryRun && !!args.persistFindings,
            promoteFindingsToReviewItems:
                !args.dryRun &&
                !!args.persistFindings &&
                !!args.promoteFindingsToReviewItems,
        });

        let processedTurns = 0;
        let signalCount = 0;
        let findingCount = 0;
        let reviewItemCount = 0;
        const reviewItemFingerprints = new Set<string>();
        const reviewItemFingerprintsByProject = new Map<string, Set<string>>();
        const shouldPersistSignals = args.persistSignals ?? !args.dryRun;
        const shouldPersistFindings = !args.dryRun && !!args.persistFindings;
        const shouldPromoteFindingsToReviewItems =
            shouldPersistFindings && !!args.promoteFindingsToReviewItems;

        try {
            // Per-candidate isolation: one turn erroring (schema violation,
            // provider failure) must not fail the run and drop every other
            // turn's signal.
            const reviewedTurns = (
                await Promise.all(
                    args.candidates.map(async (candidate) => {
                        try {
                            return {
                                candidate,
                                classifiedTurn:
                                    await this.classifyTurnWithJudge(
                                        candidate,
                                        getAgentConfig(
                                            candidate.subject.agentUuid,
                                        ),
                                        { projectContextEnabled: true },
                                    ),
                            };
                        } catch (error) {
                            Logger.error(
                                'AI review judge failed for turn; skipping',
                                {
                                    promptUuid:
                                        candidate.subject.assistantPromptUuid,
                                    threadUuid: candidate.subject.threadUuid,
                                    errorMessage:
                                        error instanceof Error
                                            ? error.message
                                            : String(error),
                                },
                            );
                            return null;
                        }
                    }),
                )
            ).filter(
                (
                    reviewedTurn,
                ): reviewedTurn is AiAgentReviewClassifierReviewedTurn =>
                    reviewedTurn !== null,
            );

            const report = AiAgentReviewClassifierService.buildReport({
                dryRun: !!args.dryRun,
                reviewedTurns,
            });
            const reviewedFindingCount = reviewedTurns.filter(
                ({ classifiedTurn }) => !!classifiedTurn.finding,
            ).length;

            /* eslint-disable no-await-in-loop */
            // eslint-disable-next-line no-restricted-syntax
            for (const { classifiedTurn } of reviewedTurns) {
                let reviewItemOutcome: 'created' | 'recurred' | null = null;
                if (shouldPersistSignals) {
                    const persisted =
                        await this.aiAgentReviewClassifierModel.createTurnSignal(
                            {
                                runUuid: run.uuid,
                                turnSignal: classifiedTurn.signal,
                                finding: shouldPersistFindings
                                    ? classifiedTurn.finding
                                    : null,
                            },
                        );
                    reviewItemOutcome = persisted.reviewItemOutcome;
                }
                signalCount += 1;

                if (shouldPersistFindings && classifiedTurn.finding) {
                    findingCount += 1;
                    if (shouldPromoteFindingsToReviewItems) {
                        const { fingerprint } =
                            classifiedTurn.finding.reviewItem;
                        reviewItemFingerprints.add(fingerprint);
                        reviewItemCount = reviewItemFingerprints.size;
                        // Only newly created items ping Slack; a recurrence
                        // accrues onto its existing card without re-notifying.
                        if (reviewItemOutcome === 'created') {
                            const projectFingerprints =
                                reviewItemFingerprintsByProject.get(
                                    classifiedTurn.signal.subject.projectUuid,
                                ) ?? new Set<string>();
                            projectFingerprints.add(fingerprint);
                            reviewItemFingerprintsByProject.set(
                                classifiedTurn.signal.subject.projectUuid,
                                projectFingerprints,
                            );
                        }
                    }
                }

                processedTurns += 1;
            }
            /* eslint-enable no-await-in-loop */

            await this.aiAgentReviewClassifierModel.updateRun({
                runUuid: run.uuid,
                status: 'completed',
                processedTurns,
                signalCount,
                findingCount: reviewedFindingCount,
                reviewItemCount,
                completedAt: new Date(),
            });

            this.debugLog('RunCompleted', {
                runUuid: run.uuid,
                processedTurns,
                signalCount,
                findingCount: reviewedFindingCount,
                reviewItemCount,
            });

            if (
                shouldPromoteFindingsToReviewItems &&
                reviewItemFingerprintsByProject.size > 0
            ) {
                await Promise.all(
                    Array.from(reviewItemFingerprintsByProject.entries()).map(
                        ([projectUuid, fingerprints]) =>
                            this.aiAgentReviewNotificationService.notifyNeedsReview(
                                {
                                    organizationUuid: args.organizationUuid,
                                    projectUuid,
                                    reviewRunUuid: run.uuid,
                                    fingerprints: Array.from(fingerprints),
                                },
                            ),
                    ),
                );
            }

            return {
                runUuid: run.uuid,
                processedTurns,
                signalCount,
                findingCount: reviewedFindingCount,
                reviewItemCount,
                report,
            };
        } catch (error) {
            this.debugLog('RunFailed', {
                runUuid: run.uuid,
                processedTurns,
                signalCount,
                findingCount,
                reviewItemCount,
                errorMessage:
                    error instanceof Error ? error.message : String(error),
            });
            await this.aiAgentReviewClassifierModel.updateRun({
                runUuid: run.uuid,
                status: 'failed',
                processedTurns,
                signalCount,
                findingCount,
                reviewItemCount,
                errorMessage:
                    error instanceof Error ? error.message : String(error),
                completedAt: new Date(),
            });
            throw error;
        }
    }

    /**
     * Next-turn-derived signals require a real next user turn. When there is
     * none, strip them, and demote the finding when nothing else supports the
     * promotion — the promotion was built on fabricated evidence. Explicit
     * human feedback (score/comment) is independent grounds for promotion, so
     * it always blocks the demotion.
     */
    static enforceNextUserSignalGrounding(
        judgeOutput: AiAgentReviewClassifierJudgeOutput,
        grounding: {
            hasNextUserPrompt: boolean;
            hasHumanFeedback: boolean;
        },
    ): AiAgentReviewClassifierJudgeOutput {
        if (grounding.hasNextUserPrompt) {
            return judgeOutput;
        }
        const nextUserSources = new Set([
            'next_user_correction',
            'next_user_dispute',
            'next_user_retry',
            'output_shape_correction',
        ]);
        const fabricatedSources = judgeOutput.implicitSignalSources.filter(
            (source) => nextUserSources.has(source),
        );
        if (fabricatedSources.length === 0) {
            return judgeOutput;
        }
        const implicitSignalSources = judgeOutput.implicitSignalSources.filter(
            (source) => !nextUserSources.has(source),
        );
        const shouldDemote =
            judgeOutput.promotedToFinding &&
            implicitSignalSources.length === 0 &&
            !grounding.hasHumanFeedback;
        if (!shouldDemote) {
            return { ...judgeOutput, implicitSignalSources };
        }
        return {
            ...judgeOutput,
            implicitSignalSources,
            promotedToFinding: false,
            promotionReason: 'next_user_signal_without_next_user_prompt',
        };
    }

    private async classifyTurnWithJudge(
        candidate: AiAgentReviewClassifierTurnCandidate,
        agentConfig: AiAgentReviewAgentConfigEvidence,
        args: { projectContextEnabled: boolean },
    ): Promise<AiAgentReviewClassifierClassifiedTurn> {
        const successfulWritebackEvidence =
            AiAgentReviewClassifierService.getSuccessfulWritebackEvidence(
                candidate,
            );
        if (successfulWritebackEvidence) {
            const signal =
                AiAgentReviewClassifierService.buildWritebackInProgressSignal(
                    candidate,
                    successfulWritebackEvidence.toolCallId,
                );

            Logger.info(
                'AI agent review suppressed finding for writeback turn',
                {
                    runPromptUuid: candidate.subject.assistantPromptUuid,
                    threadUuid: candidate.subject.threadUuid,
                    projectUuid: candidate.subject.projectUuid,
                    agentUuid: candidate.subject.agentUuid,
                    toolName: successfulWritebackEvidence.toolName,
                    toolCallId: successfulWritebackEvidence.toolCallId,
                    promotionReason: signal.promotionReason,
                },
            );

            return { signal, finding: null };
        }

        const reviewEvidence = await this.buildReviewEvidence(
            candidate,
            agentConfig,
        );
        const rawJudgeOutput = await this.judgeTurn(
            candidate,
            reviewEvidence.evidencePacket,
        );
        const judgeOutput =
            AiAgentReviewClassifierService.enforceNextUserSignalGrounding(
                rawJudgeOutput,
                {
                    hasNextUserPrompt:
                        reviewEvidence.evidencePacket.nextUserPrompt !== null,
                    hasHumanFeedback:
                        reviewEvidence.evidencePacket.humanFeedback.score !==
                            null ||
                        !!reviewEvidence.evidencePacket.humanFeedback.comment,
                },
            );
        if (judgeOutput !== rawJudgeOutput) {
            this.debugLog('NextUserSignalGroundingApplied', {
                promptUuid: candidate.subject.assistantPromptUuid,
                threadUuid: candidate.subject.threadUuid,
                strippedSources: rawJudgeOutput.implicitSignalSources.filter(
                    (source) =>
                        !judgeOutput.implicitSignalSources.includes(source),
                ),
                demoted:
                    rawJudgeOutput.promotedToFinding &&
                    !judgeOutput.promotedToFinding,
            });
        }
        // Resolve the judge's dedup match: a valid key reuses that item's
        // fingerprint; a null/hallucinated key falls back to computing one.
        const { matchedExistingItemKey } = judgeOutput;
        const matchedFingerprint =
            matchedExistingItemKey !== null
                ? (reviewEvidence.dedupKeyToFingerprint.get(
                      matchedExistingItemKey,
                  ) ?? null)
                : null;
        if (matchedExistingItemKey !== null && matchedFingerprint === null) {
            this.debugLog('InvalidMatchedItemKey', {
                promptUuid: candidate.subject.assistantPromptUuid,
                threadUuid: candidate.subject.threadUuid,
                matchedExistingItemKey,
            });
        }
        const fingerprintSource: 'matched' | 'computed' =
            matchedFingerprint !== null ? 'matched' : 'computed';

        const signal: AiAgentReviewClassifierTurnSignal = {
            subject: candidate.subject,
            interactionSource: candidate.interactionSource,
            sourceRef: candidate.sourceRef,
            signal: judgeOutput.signal,
            implicitSignalSources: judgeOutput.implicitSignalSources,
            confidence: judgeOutput.confidence,
            promotedToFinding: judgeOutput.promotedToFinding,
            promotionReason: judgeOutput.promotionReason,
            toolEvidenceRefs: candidate.supportingEvidence
                .map((evidence) => evidence.toolCallId)
                .slice(0, 5),
            runtimeContextSnapshot: {
                userUuid: null,
                canRunSql: false,
                canManageAgent: false,
            },
            modelMetadata: candidate.modelMetadata,
        };
        const promotableImplicitSignalSources =
            judgeOutput.implicitSignalSources.filter(
                (source) => source !== 'output_shape_correction',
            );

        Logger.info('AI agent review agent judged turn', {
            runPromptUuid: candidate.subject.assistantPromptUuid,
            threadUuid: candidate.subject.threadUuid,
            projectUuid: candidate.subject.projectUuid,
            agentUuid: candidate.subject.agentUuid,
            signal: judgeOutput.signal,
            primaryRootCause: judgeOutput.primaryRootCause,
            promotedToFinding: judgeOutput.promotedToFinding,
            confidence: judgeOutput.confidence,
            judgePromptHash: JUDGE_PROMPT_HASH,
            matchedExistingItemKey: judgeOutput.matchedExistingItemKey,
            implicitSignalSources: judgeOutput.implicitSignalSources,
            hasImplicitSignal: judgeOutput.implicitSignalSources.length > 0,
            hasPromotableImplicitSignal:
                promotableImplicitSignalSources.length > 0,
            droppedImplicitSignal:
                promotableImplicitSignalSources.length > 0 &&
                !judgeOutput.promotedToFinding,
        });
        this.debugLog('TurnJudged', {
            promptUuid: candidate.subject.assistantPromptUuid,
            threadUuid: candidate.subject.threadUuid,
            agentConfigSnapshotHash: reviewEvidence.agentConfig.snapshotHash,
            catalogMatchCount:
                reviewEvidence.evidencePacket.semanticContext.catalogMatches
                    .length,
            signal: judgeOutput.signal,
            implicitSignalSources: judgeOutput.implicitSignalSources,
            promotedToFinding: judgeOutput.promotedToFinding,
            promotionReason: judgeOutput.promotionReason,
            confidence: judgeOutput.confidence,
            primaryRootCause: judgeOutput.primaryRootCause,
            secondaryRootCauses: judgeOutput.secondaryRootCauses,
            subcategories: judgeOutput.subcategories,
            fixTargets: judgeOutput.fixTargets,
            targetRefs: judgeOutput.targetRefs,
            recommendationAction: judgeOutput.recommendation?.actionType,
            reviewItemTitle: judgeOutput.reviewItem.title,
            matchedExistingItemKey,
            matchedKeyValidated: matchedFingerprint !== null,
            fingerprintSource,
        });

        if (!judgeOutput.promotedToFinding) {
            return { signal, finding: null };
        }

        const targetRefs =
            AiAgentReviewClassifierService.normalizeJudgeTargetRefs({
                judgeTargetRefs: judgeOutput.targetRefs,
                agentUuid: candidate.subject.agentUuid,
            });
        const recommendation = judgeOutput.recommendation
            ? {
                  ...judgeOutput.recommendation,
                  targetRefs:
                      AiAgentReviewClassifierService.normalizeJudgeTargetRefs({
                          judgeTargetRefs:
                              judgeOutput.recommendation.targetRefs.length > 0
                                  ? judgeOutput.recommendation.targetRefs
                                  : judgeOutput.targetRefs,
                          agentUuid: candidate.subject.agentUuid,
                      }),
              }
            : null;

        const fingerprint =
            matchedFingerprint ??
            getAiAgentReviewItemFingerprint({
                organizationUuid: candidate.subject.organizationUuid,
                projectUuid: candidate.subject.projectUuid,
                agentUuid: candidate.subject.agentUuid,
                threadUuid: candidate.subject.threadUuid,
                primaryRootCause: judgeOutput.primaryRootCause,
                subcategories: judgeOutput.subcategories,
                fixTargets: judgeOutput.fixTargets,
                targetRefs,
                agentConfigurationSettings:
                    judgeOutput.agentConfigurationSettings,
                capabilityKey:
                    targetRefs.find(
                        (
                            targetRef,
                        ): targetRef is Extract<
                            AiAgentTargetRef,
                            { type: 'product_capability' }
                        > => targetRef.type === 'product_capability',
                    )?.capabilityKey ?? null,
            });

        const projectContextEntry =
            args.projectContextEnabled &&
            judgeOutput.primaryRootCause === 'project_context'
                ? judgeOutput.projectContextEntry
                : null;

        return {
            signal,
            finding: {
                primaryRootCause: judgeOutput.primaryRootCause,
                secondaryRootCauses: judgeOutput.secondaryRootCauses,
                subcategories: judgeOutput.subcategories,
                fixTargets: judgeOutput.fixTargets,
                targetRefs,
                evidenceExcerpts: judgeOutput.evidenceExcerpts,
                recommendation,
                projectContextEntry,
                reviewItem: {
                    fingerprint,
                    title: judgeOutput.reviewItem.title,
                    description: judgeOutput.reviewItem.description,
                    ownerType: judgeOutput.ownerType,
                },
            },
        };
    }

    private static normalizeJudgeTargetRefs({
        judgeTargetRefs,
        agentUuid,
    }: {
        judgeTargetRefs: AiAgentReviewClassifierJudgeTargetRef[];
        agentUuid: string;
    }): AiAgentTargetRef[] {
        return judgeTargetRefs.map((targetRef) => {
            const modelName = targetRef.modelName ?? targetRef.label;
            const fieldName = targetRef.fieldName ?? targetRef.label;
            const key = targetRef.key ?? targetRef.label;

            switch (targetRef.type) {
                case 'model':
                    return { type: 'model', modelName };
                case 'explore':
                    return {
                        type: 'explore',
                        modelName,
                        exploreName: fieldName,
                    };
                case 'join':
                    return { type: 'join', modelName, joinName: fieldName };
                case 'dimension':
                    return {
                        type: 'dimension',
                        modelName,
                        dimensionName: fieldName,
                    };
                case 'metric':
                    return { type: 'metric', modelName, metricName: fieldName };
                case 'additional_dimension':
                    return {
                        type: 'additional_dimension',
                        modelName,
                        parentDimensionName: modelName,
                        dimensionName: fieldName,
                    };
                case 'required_filter':
                    return {
                        type: 'required_filter',
                        modelName,
                        exploreName: modelName,
                        fieldName,
                    };
                case 'ai_hint':
                    return {
                        type: 'ai_hint',
                        modelName,
                        targetType: 'model',
                        targetName: fieldName,
                    };
                case 'agent':
                    return { type: 'agent', agentUuid };
                case 'agent_config':
                    return {
                        type: 'agent_config',
                        setting: targetRef.setting ?? 'unknown',
                    };
                case 'product_capability':
                    return { type: 'product_capability', capabilityKey: key };
                case 'runtime':
                    return { type: 'runtime', key };
                default:
                    return { type: 'agent', agentUuid };
            }
        });
    }

    private async buildReviewEvidence(
        candidate: AiAgentReviewClassifierTurnCandidate,
        agentConfig: AiAgentReviewAgentConfigEvidence,
    ): Promise<{
        evidencePacket: AiAgentReviewJudgeEvidencePacket;
        agentConfig: AiAgentReviewAgentConfigEvidence;
        // key ("item_1") → existing item fingerprint, kept server-side so a
        // matchedExistingItemKey resolves to a real fingerprint (never the LLM).
        dedupKeyToFingerprint: Map<string, string>;
    }> {
        const semanticContext = await this.buildSemanticContext(
            candidate,
            agentConfig.catalogVisibility,
        );
        const threadWritebackPullRequests =
            (
                await this.aiAgentReviewClassifierModel.getThreadWritebackPullRequests(
                    [candidate.subject.threadUuid],
                )
            ).get(candidate.subject.threadUuid) ?? [];

        const { existingReviewItems, dedupKeyToFingerprint } =
            await this.loadDedupCandidates(candidate);

        return {
            agentConfig,
            dedupKeyToFingerprint,
            evidencePacket:
                AiAgentReviewClassifierService.buildJudgeEvidencePacket({
                    candidate,
                    agentConfig,
                    semanticContext,
                    threadWritebackPullRequests,
                    existingReviewItems,
                }),
        };
    }

    /**
     * Loads this project's existing review items as dedup candidates. Assigns
     * opaque keys ("item_1", …) the judge can reference, and keeps a server-side
     * key → fingerprint map so a match resolves to a real fingerprint. A failed
     * load degrades to no candidates — it must never fail the review.
     */
    private async loadDedupCandidates(
        candidate: AiAgentReviewClassifierTurnCandidate,
    ): Promise<{
        existingReviewItems: AiAgentReviewItemDedupCandidate[];
        dedupKeyToFingerprint: Map<string, string>;
    }> {
        try {
            const rows =
                await this.aiAgentReviewClassifierModel.findReviewItemDedupCandidates(
                    {
                        organizationUuid: candidate.subject.organizationUuid,
                        projectUuid: candidate.subject.projectUuid,
                        limit: 30,
                    },
                );
            const existingReviewItems: AiAgentReviewItemDedupCandidate[] = [];
            const dedupKeyToFingerprint = new Map<string, string>();
            rows.forEach((row, index) => {
                const key = `item_${index + 1}`;
                dedupKeyToFingerprint.set(key, row.fingerprint);
                existingReviewItems.push({
                    key,
                    title: row.title ?? 'Untitled review item',
                    status: row.status,
                    dismissedReason: row.dismissedReason,
                    primaryRootCause:
                        (row.primaryRootCause as AiAgentRootCause | null) ??
                        'ambiguous',
                    objectSummary:
                        AiAgentReviewClassifierService.buildDedupObjectSummary(
                            row.targetRefs,
                        ),
                });
            });
            return { existingReviewItems, dedupKeyToFingerprint };
        } catch (error) {
            this.debugLog('DedupCandidatesFailed', {
                promptUuid: candidate.subject.assistantPromptUuid,
                projectUuid: candidate.subject.projectUuid,
                errorMessage:
                    error instanceof Error ? error.message : String(error),
            });
            return {
                existingReviewItems: [],
                dedupKeyToFingerprint: new Map<string, string>(),
            };
        }
    }

    /**
     * Comma-joined human-readable leaf names of an item's target refs, so the
     * judge can tell what each candidate is about without seeing fingerprints.
     */
    private static buildDedupObjectSummary(
        targetRefs: AiAgentTargetRef[] | null,
    ): string | null {
        if (!targetRefs || targetRefs.length === 0) {
            return null;
        }
        const names = targetRefs
            .map((targetRef) =>
                AiAgentReviewClassifierService.targetRefLeafName(targetRef),
            )
            .filter((name): name is string => !!name);
        return names.length > 0 ? names.join(', ') : null;
    }

    private static targetRefLeafName(
        targetRef: AiAgentTargetRef,
    ): string | null {
        switch (targetRef.type) {
            case 'model':
                return targetRef.modelName;
            case 'explore':
                return targetRef.exploreName;
            case 'join':
                return targetRef.joinName;
            case 'dimension':
                return targetRef.dimensionName;
            case 'metric':
                return targetRef.metricName;
            case 'additional_dimension':
                return targetRef.dimensionName;
            case 'required_filter':
                return targetRef.fieldName;
            case 'ai_hint':
                return targetRef.targetName;
            case 'agent_config':
                return targetRef.setting;
            case 'product_capability':
                return targetRef.capabilityKey;
            case 'runtime':
                return targetRef.key;
            case 'agent':
            case 'content':
                return null;
            default:
                return assertUnreachable(
                    targetRef,
                    'Unknown target ref type in dedup object summary',
                );
        }
    }

    private async captureAgentConfigSnapshot(
        candidate: AiAgentReviewClassifierTurnCandidate,
    ): Promise<AiAgentReviewAgentConfigEvidence> {
        try {
            const agent = await this.aiAgentModel.getAgent({
                organizationUuid: candidate.subject.organizationUuid,
                projectUuid: candidate.subject.projectUuid,
                agentUuid: candidate.subject.agentUuid,
            });
            const [knowledgeDocuments, mcpServers] = await Promise.all([
                this.aiAgentDocumentModel.findAllForAgent({
                    organizationUuid: candidate.subject.organizationUuid,
                    agentUuid: candidate.subject.agentUuid,
                    projectUuid: candidate.subject.projectUuid,
                }),
                this.aiAgentReviewClassifierModel.getAgentMcpCapabilities(
                    candidate.subject.agentUuid,
                ),
            ]);

            const instruction = agent.instruction ?? null;
            const settings = [
                instruction ? 'instructions' : null,
                knowledgeDocuments.length > 0 ? 'knowledge_documents' : null,
                agent.enableDataAccess ? 'data_access' : null,
                agent.enableSelfImprovement ? 'self_improvement' : null,
                mcpServers.length > 0 ? 'mcp_servers' : null,
                agent.tags && agent.tags.length > 0 ? 'explore_tags' : null,
                agent.spaceAccess.length > 0 ? 'space_access' : null,
                agent.groupAccess.length > 0 || agent.userAccess.length > 0
                    ? 'user_or_group_access'
                    : null,
            ].filter(
                (setting): setting is AiAgentConfigurationSetting => !!setting,
            );
            const availableCapabilities: AiAgentAvailableCapability[] = [
                'semantic_query',
                'chart_generation',
                'dashboard_generation',
                'data_value_search',
                ...(agent.enableDataAccess
                    ? (['chart_data_access'] as const)
                    : []),
                ...(agent.enableSelfImprovement
                    ? (['context_improvement'] as const)
                    : []),
                ...(agent.enableContentTools
                    ? (['content_editing'] as const)
                    : []),
                ...(mcpServers.length > 0 ? (['mcp_tools'] as const) : []),
            ];

            const snapshot: AiAgentConfigSnapshot = {
                capturedAt: new Date().toISOString(),
                agentUpdatedAt: agent.updatedAt
                    ? new Date(agent.updatedAt).toISOString()
                    : null,
                settings,
                availableCapabilities,
                instructionHash: instruction ? hashText(instruction) : null,
                instructionSummary: instruction
                    ? truncate(instruction, 2000)
                    : null,
                knowledgeDocuments: knowledgeDocuments.map((document) => ({
                    uuid: document.uuid,
                    name: document.name,
                    updatedAt: document.updatedAt.toISOString(),
                    summary: document.summary,
                })),
                mcpServers,
            };
            const snapshotHash = getAiAgentConfigSnapshotHash(snapshot);

            return {
                snapshot,
                snapshotHash,
                agentUpdatedAt: agent.updatedAt
                    ? new Date(agent.updatedAt)
                    : null,
                settings: snapshot.settings,
                availableCapabilities: snapshot.availableCapabilities,
                dataAccessEnabled: agent.enableDataAccess,
                selfImprovementEnabled: agent.enableSelfImprovement,
                contentToolsEnabled: agent.enableContentTools,
                instructionSummary: snapshot.instructionSummary,
                knowledgeDocumentCount: snapshot.knowledgeDocuments.length,
                knowledgeDocuments: snapshot.knowledgeDocuments,
                mcpServers: snapshot.mcpServers,
                catalogVisibility: await this.computeCatalogVisibility(
                    candidate.subject.projectUuid,
                    agent.tags,
                ),
            };
        } catch (error) {
            this.debugLog('AgentConfigSnapshotFailed', {
                promptUuid: candidate.subject.assistantPromptUuid,
                agentUuid: candidate.subject.agentUuid,
                errorMessage:
                    error instanceof Error ? error.message : String(error),
            });

            return AiAgentReviewClassifierService.emptyAgentConfigEvidence();
        }
    }

    private static emptyAgentConfigEvidence(): AiAgentReviewAgentConfigEvidence {
        return {
            snapshot: null,
            snapshotHash: null,
            agentUpdatedAt: null,
            settings: [],
            availableCapabilities: [],
            dataAccessEnabled: null,
            selfImprovementEnabled: null,
            contentToolsEnabled: null,
            instructionSummary: null,
            knowledgeDocumentCount: 0,
            knowledgeDocuments: [],
            mcpServers: [],
            catalogVisibility: null,
        };
    }

    /**
     * Computes what a tag-restricted agent can see, mirroring the runtime
     * filterExploreByTags scoping. Loads the explore cache once per agent per
     * run (called from captureAgentConfigSnapshot, not per candidate). A
     * failure here degrades to unscoped rather than dropping the whole
     * agent config.
     */
    private async computeCatalogVisibility(
        projectUuid: string,
        exploreTags: string[] | null,
    ): Promise<AiAgentReviewCatalogVisibility | null> {
        if (!exploreTags || exploreTags.length === 0) {
            return null;
        }
        try {
            const explores = Object.values(
                await this.projectModel.findExploresFromCache(
                    projectUuid,
                    'name',
                ),
            );
            const visibleExploreNames = new Set<string>();
            const visibleTables = new Set<string>();
            const visibleFields = new Set<string>();
            explores
                .filter(
                    (explore): explore is Explore => !isExploreError(explore),
                )
                .forEach((explore) => {
                    const filtered = filterExploreByTags({
                        explore,
                        availableTags: exploreTags,
                    });
                    if (!filtered) {
                        return;
                    }
                    Object.entries(filtered.tables).forEach(
                        ([tableName, table]) => {
                            const fieldNames = [
                                ...Object.keys(table.dimensions),
                                ...Object.keys(table.metrics),
                            ];
                            if (fieldNames.length === 0) {
                                return;
                            }
                            visibleExploreNames.add(explore.name);
                            visibleTables.add(tableName);
                            fieldNames.forEach((fieldName) =>
                                visibleFields.add(`${tableName}.${fieldName}`),
                            );
                        },
                    );
                });
            return { visibleExploreNames, visibleTables, visibleFields };
        } catch (error) {
            this.debugLog('CatalogVisibilityFailed', {
                projectUuid,
                errorMessage:
                    error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }

    /**
     * Restricts the catalog to what the reviewed agent can actually see.
     * Without this the judge cannot distinguish "field is missing"
     * (semantic_layer) from "field exists but this agent cannot access it"
     * (agent_configuration). Table-type catalog items are named after the
     * explore, so they match on explore name as well as table name.
     */
    private static scopeCatalogToAgent(
        catalogItems: CatalogItemSummary[],
        visibility: AiAgentReviewCatalogVisibility | null,
    ): CatalogItemSummary[] {
        if (!visibility) {
            return catalogItems;
        }
        return catalogItems.filter((item) =>
            item.type === CatalogType.Table
                ? visibility.visibleExploreNames.has(item.name) ||
                  visibility.visibleTables.has(item.name)
                : visibility.visibleFields.has(
                      `${item.tableName}.${item.name}`,
                  ),
        );
    }

    private async buildSemanticContext(
        candidate: AiAgentReviewClassifierTurnCandidate,
        catalogVisibility: AiAgentReviewCatalogVisibility | null,
    ): Promise<AiAgentReviewJudgeEvidencePacket['semanticContext']> {
        const queriedExploreNames = [
            ...new Set(
                candidate.queryHistory
                    .map((queryHistory) => queryHistory.metricQuery.exploreName)
                    .filter((exploreName): exploreName is string =>
                        Boolean(exploreName),
                    ),
            ),
        ];
        const queriedFieldNames = [
            ...new Set(
                candidate.queryHistory.flatMap((queryHistory) => [
                    ...(queryHistory.metricQuery.metrics ?? []),
                    ...(queryHistory.metricQuery.dimensions ?? []),
                ]),
            ),
        ];

        try {
            const catalogItems =
                AiAgentReviewClassifierService.scopeCatalogToAgent(
                    await this.catalogModel.getCatalogItemsSummary(
                        candidate.subject.projectUuid,
                    ),
                    catalogVisibility,
                );

            return {
                queriedExploreNames,
                queriedFieldNames,
                catalogMatches:
                    AiAgentReviewClassifierService.getRelevantCatalogMatches({
                        catalogItems,
                        candidate,
                        queriedExploreNames,
                        queriedFieldNames,
                    }),
            };
        } catch (error) {
            this.debugLog('CatalogEvidenceFailed', {
                promptUuid: candidate.subject.assistantPromptUuid,
                projectUuid: candidate.subject.projectUuid,
                errorMessage:
                    error instanceof Error ? error.message : String(error),
            });

            return {
                queriedExploreNames,
                queriedFieldNames,
                catalogMatches: [],
            };
        }
    }

    private async judgeTurnWithLlm(
        candidate: AiAgentReviewClassifierTurnCandidate,
        evidencePacket: AiAgentReviewJudgeEvidencePacket,
    ): Promise<AiAgentReviewClassifierJudgeOutput> {
        // Run the judge on the org's own key when they have a BYO Anthropic key
        // that can serve the review model — never fall back to the instance
        // provider for their turn data.
        const { canJudgeOnByoKey } =
            await this.orgAiCopilotConfigResolver.getReviewJudgeAvailability(
                candidate.subject.organizationUuid,
            );
        const copilotConfig = canJudgeOnByoKey
            ? await this.orgAiCopilotConfigResolver.getCopilotConfig(
                  candidate.subject.organizationUuid,
              )
            : this.lightdashConfig.ai.copilot;
        const model = getModel(copilotConfig, {
            provider: canJudgeOnByoKey
                ? 'anthropic'
                : resolveReviewJudgeProvider(copilotConfig),
            useFastModel: true,
        });

        this.debugLog('JudgeRequest', {
            promptUuid: candidate.subject.assistantPromptUuid,
            threadUuid: candidate.subject.threadUuid,
            judgeModelId: model.model.modelId,
            modelProvider: candidate.modelMetadata.provider,
            modelName: candidate.modelMetadata.model,
            previousTurnCount: evidencePacket.previousTurns.length,
            queryHistoryCount: evidencePacket.queryHistory.length,
            catalogMatchCount:
                evidencePacket.semanticContext.catalogMatches.length,
            agentConfigSnapshotHash: evidencePacket.agentConfig.snapshotHash,
            supportingEvidenceCount: evidencePacket.supportingEvidence.length,
            hasNextUserPrompt: !!evidencePacket.nextUserPrompt,
            hasHumanFeedback:
                evidencePacket.humanFeedback.score !== null ||
                !!evidencePacket.humanFeedback.comment,
            evidenceExcerptCount:
                evidencePacket.suggestedEvidenceExcerpts.length,
        });

        const telemetry = getAiCallTelemetry({
            functionId: 'aiAgentReviewClassifierJudge',
            feature: 'review-classifier',
            organizationUuid: candidate.subject.organizationUuid,
            projectUuid: candidate.subject.projectUuid,
            agentUuid: candidate.subject.agentUuid,
            threadUuid: candidate.subject.threadUuid,
            promptUuid: candidate.subject.assistantPromptUuid,
            ...getLanguageModelAttribution(model.model),
        });
        const result = await generateObject({
            model: model.model,
            ...defaultAgentOptions,
            ...model.callOptions,
            providerOptions: model.providerOptions,
            experimental_telemetry: telemetry,
            schema: aiAgentReviewClassifierJudgeOutputSchema,
            messages: [
                {
                    role: 'system',
                    content: `You are an LLM-as-judge review agent for Lightdash AI analyst turns.

Classify whether the assistant turn contains an actionable issue. Use only the supplied evidence packet. Do not invent project fields or facts.

Root cause definitions:
- semantic_layer: the dbt/Lightdash semantic layer should change. This covers both adding to the model — a new model, join, dimension, metric, filter, or AI hint because the data is not currently exposed — and editing existing YAML metadata. Use this even when the underlying warehouse/dbt data may be missing or insufficient: the durable fix still lives in the semantic layer, and the writeback agent (which can inspect the live project) decides whether to expose the data or report that upstream modeling is needed.
- project_context: available explores, project context, or knowledge about which explore to use is missing/wrong.
- agent_configuration: Lightdash agent settings should change, e.g. instructions, knowledge docs, data access, SQL mode, MCP, access.
- product_capability: Lightdash product capability limitation or feature request.
- runtime_reliability: query/tool/runtime failed or timed out.
- feedback_quality: explicit feedback is too ambiguous to classify without admin review.
- not_a_failure: normal refinement, new request, acceptance, formatting-only change, or harmless follow-up.
- ambiguous: likely issue, but insufficient evidence to choose one root cause.

Implicit signal definitions — set these whenever the evidence supports them:
- assistant_no_answer: the assistant did not answer the user's actual question. This includes giving only a workaround for missing data ("we don't have X, so here's Y instead"), explicitly saying the data is not available, or producing an empty / non-substantive response.
- next_user_correction: the next user prompt corrects or pushes back on the previous answer's field, metric, explore, scope, business definition, or data availability ("actually I meant…", "but what about…", "you can't connect them?"). Do not use this for ordinary drill-downs or additive follow-up questions.
- next_user_dispute: the next user prompt explicitly says the previous answer was wrong.
- next_user_retry: the next user prompt asks the same unresolved question again or asks to try a different approach after a failed, empty, non-substantive, or off-target answer. Do not use this for normal iterative exploration after a useful answer.
- output_shape_correction: the next user prompt asks for a different chart / format / grouping with no semantic change.
- tool_error: a tool call errored, timed out, or returned an empty / error result the assistant did not recover from. A human SQL-approval gate expiring (evidence packet pendingApprovalTimeout=true, or a result saying the SQL approval timed out / the user may have stepped away) is NOT a tool_error — it is expected behavior when the user steps away, not a runtime or warehouse defect. Do not promote it as runtime_reliability; when it is the only issue in the turn use promotedToFinding=false (or feedback_quality at most), especially when humanFeedback.score is not negative.
- product_capability_request: the user asked for something Lightdash cannot currently express.
- human_intervention: an admin or engineer had to step in.

Grounding rules for next_user_* signals — these override everything below:
- The evidence packet's nextUserPrompt field is the ONLY evidence for next_user_correction, next_user_dispute, and next_user_retry. When nextUserPrompt is null there is no next user turn: never emit these signals, and never imagine or predict what the user would say next.
- Never derive next_user_* signals from the reviewed turn's own userPrompt, from the assistant's answer, or from caveats, hedging, or self-critique inside the assistant's answer.
- A clarifying or interrogative question asked BY THE ASSISTANT is not a user retry, correction, or dispute.

Decision rules — apply in order:

1. First, populate implicitSignalSources by inspecting the evidence packet. Do not skip this step.

2. The evidence packet field toolOutcomes lists the outcome (success | error | unknown) of EVERY content-mutating, writeback, preview-deploy, and MCP tool call in the turn — it is complete even when the corresponding trace is not in supportingEvidence. A success there means the action really happened: never claim the assistant lacks a capability, fabricated an action, or failed to execute when toolOutcomes shows that tool succeeding. status=unknown means the result was never recorded — treat it as inconclusive, not as success or failure; status=error is a text heuristic, so cross-check it against supportingEvidence before promoting on it. If the evidence shows the assistant successfully called a writeback tool (for example editDbtProject or runAiWriteback) and opened or updated a pull request, do not promote this as a semantic_layer or project_context finding. The remediation is already in progress; use promotedToFinding=false, signal=acceptance_or_continuation, primaryRootCause=not_a_failure, and promotionReason=writeback_tool_already_started. The evidence packet field threadWritebackPullRequests lists PRs the agent has already opened in this thread — when it is non-empty a real pull request exists, so do not infer from prose that the assistant fabricated it. Only consider writeback turns promotable when the tool failed, opened no pull request despite a clear requested change, or the user later says the PR is wrong.

3. Treat implicitSignalSources as strong evidence of unresolved user intent, not as decoration. Promote when the implicit signal points to likely assistant failure:
   - Always promote assistant_no_answer, next_user_dispute, tool_error, product_capability_request, and human_intervention.
   - Promote next_user_correction when the correction is about field choice, metric choice, explore/source selection, scoping, business definition, missing data, or whether the assistant can connect the requested data.
   - Promote next_user_retry only when the previous answer was failed, empty, non-substantive, off-target, or only offered a workaround instead of answering the user's actual question.
   - Do not promote output_shape_correction alone, routine drill-downs, normal follow-up questions, or chart/format-only changes when the assistant answered the user's actual question.

When promoting, pick primaryRootCause by mapping the dominant signal:
   - assistant_no_answer where the assistant names a missing join, missing column, missing relationship, or missing field, OR where the warehouse/dbt data the user asked for is not currently exposed (a model/join/field would need to be added) → semantic_layer.
   - assistant_no_answer where the assistant picked a wrong / unrelated explore or field → project_context.
   - assistant_no_answer due to disabled SQL or data access, missing instructions, or missing knowledge docs → agent_configuration.
   - assistant_no_answer because Lightdash cannot express the question (missing chart type, unsupported pivot, etc.) → product_capability.
   - next_user_correction or next_user_dispute about which explore/source/table to use, or about what an entity, acronym, or business term refers to → project_context.
   - next_user_correction or next_user_dispute about a field, metric, dimension, join, or filter definition within the right explore → semantic_layer.
   - next_user_retry after a failed or empty answer → runtime_reliability or agent_configuration depending on cause.
   - tool_error → runtime_reliability.
   - Query-construction failures are NOT missing data: when queryHistory shows a filter-validation error, or degenerate filters that guarantee empty or partial results (an isNull filter on the requested date dimension, equality on a single date, stacked over-restrictive filters), attribute the empty/sparse result to the agent's own query construction → runtime_reliability (or agent_configuration when instructions caused it), NOT semantic_layer. Do not emit semantic_yaml_patch or dbt_modeling_ticket fixTargets for it. Do not accept the assistant's own "we don't have this data" prose as ground truth when its queries were malformed — inspect metricQuery.filters yourself.
   - product_capability_request → product_capability.
   - human_intervention → agent_configuration unless evidence clearly points elsewhere.
   - Tiebreaker for semantic_layer vs project_context: if the durable fix is a fact the agent should KNOW — what a term/acronym/entity refers to, or which explore answers a kind of question → project_context. If the durable fix is a CHANGE to the semantic YAML — a model, dimension, metric, join, or filter definition → semantic_layer. Do not default to semantic_layer when the real gap is missing routing or knowledge about which explore to use.

4. Only set promotedToFinding=false when there is no promotable implicit signal AND the assistant answered the user's actual question. In that case use signal=acceptance_or_continuation, new_question, output_shape_correction, or normal_refinement and primaryRootCause=not_a_failure.

5. Successful queries can still be findings even without implicit signals when the user asked broad business language and the semantic / catalog context does not clearly support the selected field, explore, or metric. Promote those as semantic_layer or project_context when a model definition, AI hint, or project context rule would prevent future ambiguity, choosing between them with the explore-vs-definition tiebreaker above.

6. Use agentConfig to catch Lightdash-layer fixes: missing instructions, disabled data access, missing knowledge docs, access restrictions, or capability settings. Promote those as agent_configuration when the answer quality depends on agent setup.
   agentConfig.availableCapabilities glossary — what this specific agent can do:
   - semantic_query: run governed metric/dimension queries over the semantic layer.
   - chart_generation / dashboard_generation: create charts and dashboards from query results.
   - data_value_search: search actual values of dimensions.
   - chart_data_access: read the underlying data of existing charts.
   - context_improvement: propose project-context improvements.
   - content_editing: edit or create saved charts/dashboards via content-as-code (editContent/createContent). Some product features exist ONLY through this path — for example big-number tiles and dashboard tab management — so whether a "not supported" claim is true depends on whether this agent has it.
   - mcp_tools: external MCP servers listed in agentConfig.mcpServers together with their enabled tools (for example Linear or GitHub). Successful mcp_* calls in toolOutcomes are real integrations, not hallucinations.
   Capability routing: when the assistant claims something is "not supported" but availableCapabilities/mcpServers show the capability DOES exist for this agent → agent_configuration (stale agent knowledge or missing instructions), not product_capability. Use product_capability only when the capability genuinely does not exist for this agent. The semanticContext catalog is already scoped to what this agent can access — a field absent there may still exist in the project but be outside the agent's explore tags; prefer agent_configuration (access/tags) over semantic_layer when the user names data the agent cannot see.
   agentConfig.knowledgeDocuments lists the agent's actual knowledge documents (with summaries) — never recommend adding a knowledge document that already exists; recommend updating the existing one instead.

7. If you would promote but cannot pick one primaryRootCause confidently, set primaryRootCause=ambiguous with confidence=low or medium and still promote.

When promotedToFinding=true, provide concise evidence excerpts copied or summarized from the packet and a practical recommendation.
Never set promotedToFinding=true together with primaryRootCause=not_a_failure — they are mutually exclusive; a promoted finding always has an actionable root cause.
Use one primaryRootCause. Secondary causes are optional.
For targetRefs, return compact refs:
- type: one of the allowed target types.
- label: short human-readable target.
- modelName: dbt/Lightdash model when known, otherwise null.
- fieldName: dimension/metric/join/explore/filter name when known, otherwise null.
- setting: agent config setting for agent_config targets, otherwise null.
- key: runtime/product capability key when useful, otherwise null.
reviewItem.title should be concise and admin-facing.
reviewItem.description should summarize why this grouping exists.

Always populate targetRefs with every object the fix would touch (model, dimension, metric, join, explore). For semantic_layer and project_context findings these drive how findings collapse into one review item, so name the same object consistently across turns rather than varying the wording.

Set projectContextEntry ONLY when primaryRootCause=project_context and a single durable, project-specific fact (a business definition or acronym, routing/join guidance, or object-scoped context) would prevent this class of failure in future turns. Otherwise set it to null.
- op: "update" if one of the project context entries already injected into the reviewed turn was present but insufficient (reference its id); otherwise "create".
- id: the existing entry id when op="update", otherwise null.
- kind: definition | context. Use "definition" for acronyms and business vocabulary ("X means Y"); use "context" for everything else (routing/join rules, guidance, durable object-scoped facts).
- content: a single self-contained sentence stating the fact (e.g. '"HR" = the high-risk diabetes cohort, not human resources.').
- terms: the prompt-facing trigger words/phrases that should surface this entry (e.g. ["HR","high risk"]). Required for definitions.
- objects: typed semantic object refs derived from targetRefs. For an explore use {"type":"explore","name":"payments"}. For a field use {"type":"field","explore":"payments","fieldId":"payments_total_amount"}; the owning explore is required and must be one where that field exists. Use [] when purely prompt-driven.

Existing review items — dedup rules. The evidence packet field existingReviewItems lists this project's existing review items (key, title, status, dismissedReason, primaryRootCause, objectSummary). Apply these rules when promoting:
- If the finding's underlying user need matches an existing item — even when you would assign a DIFFERENT root cause or blame a DIFFERENT object — set matchedExistingItemKey to that item's key. The test is "would a human say this is the same problem?", not "same technical label". A timeout, a missing field, and a routing gap that all block the same user question are ONE problem.
- Items with dismissedReason=expected_behavior are known non-issues already reviewed by a human. If the turn's failure is that same behavior, set promotedToFinding=false and matchedExistingItemKey=null — do not re-file it.
- Otherwise set matchedExistingItemKey=null.`,
                },
                {
                    role: 'user',
                    content: JSON.stringify(evidencePacket, null, 2),
                },
            ],
        });
        emitAiUsage(telemetry, languageModelUsageToTokens(result.usage));

        return result.object as AiAgentReviewClassifierJudgeOutput;
    }

    private async isEnabled(args: {
        requestedByUserUuid?: string;
        organizationUuid: string;
        organizationName?: string;
    }): Promise<boolean> {
        const [settings, byo] = await Promise.all([
            this.aiOrganizationSettingsModel.findByOrganizationUuid(
                args.organizationUuid,
            ),
            this.orgAiCopilotConfigResolver.getReviewJudgeAvailability(
                args.organizationUuid,
            ),
        ]);

        return areReviewsEnabledForSettings(settings, byo);
    }

    private static buildEvidenceExcerpts(
        candidate: AiAgentReviewClassifierTurnCandidate,
    ): AiAgentEvidenceExcerpt[] {
        return [
            {
                source: 'user_prompt',
                text: truncate(candidate.userPrompt),
                redacted: false,
            },
            candidate.assistantResponse
                ? {
                      source: 'assistant_answer' as const,
                      text: truncate(candidate.assistantResponse),
                      redacted: false,
                  }
                : null,
            ...candidate.contextTurns.slice(-3).map(
                (contextTurn): AiAgentEvidenceExcerpt => ({
                    source: 'conversation_context',
                    text: truncate(
                        AiAgentReviewClassifierService.buildContextTurnText(
                            contextTurn,
                        ),
                    ),
                    redacted: false,
                }),
            ),
            candidate.nextUserPrompt
                ? {
                      source: 'next_user_prompt' as const,
                      text: truncate(candidate.nextUserPrompt),
                      redacted: false,
                  }
                : null,
            candidate.errorMessage
                ? {
                      source: 'tool_result' as const,
                      text: truncate(candidate.errorMessage),
                      redacted: false,
                  }
                : null,
            candidate.queryHistory.find((queryHistory) => queryHistory.error)
                ?.error
                ? {
                      source: 'tool_result' as const,
                      text: truncate(
                          candidate.queryHistory.find(
                              (queryHistory) => queryHistory.error,
                          )?.error ?? '',
                      ),
                      redacted: false,
                  }
                : null,
            ...candidate.supportingEvidence.slice(0, 3).map(
                (evidence): AiAgentEvidenceExcerpt => ({
                    source: 'tool_call',
                    text: truncate(
                        AiAgentReviewClassifierService.buildSupportingEvidenceText(
                            evidence,
                        ),
                    ),
                    redacted: false,
                }),
            ),
        ].filter((excerpt): excerpt is AiAgentEvidenceExcerpt => !!excerpt);
    }

    private static getSuccessfulWritebackEvidence(
        candidate: AiAgentReviewClassifierTurnCandidate,
    ):
        | AiAgentReviewClassifierTurnCandidate['supportingEvidence'][number]
        | null {
        return (
            candidate.supportingEvidence.find((evidence) => {
                const resultPreview = evidence.resultPreview ?? '';
                return (
                    WRITEBACK_TOOL_NAMES.has(evidence.toolName) &&
                    SUCCESSFUL_WRITEBACK_RESULT_PATTERN.test(resultPreview) &&
                    !NON_ACTIONABLE_WRITEBACK_RESULT_PATTERN.test(resultPreview)
                );
            }) ?? null
        );
    }

    private static buildWritebackInProgressSignal(
        candidate: AiAgentReviewClassifierTurnCandidate,
        toolCallId: string,
    ): AiAgentReviewClassifierTurnSignal {
        return {
            subject: candidate.subject,
            interactionSource: candidate.interactionSource,
            sourceRef: candidate.sourceRef,
            signal: 'acceptance_or_continuation',
            implicitSignalSources: [],
            confidence: 'high',
            promotedToFinding: false,
            promotionReason: 'writeback_tool_already_started',
            toolEvidenceRefs: [toolCallId],
            runtimeContextSnapshot: {
                userUuid: null,
                canRunSql: false,
                canManageAgent: false,
            },
            modelMetadata: candidate.modelMetadata,
        };
    }

    private static buildJudgeEvidencePacket({
        candidate,
        agentConfig,
        semanticContext,
        threadWritebackPullRequests,
        existingReviewItems,
    }: {
        candidate: AiAgentReviewClassifierTurnCandidate;
        agentConfig: AiAgentReviewJudgeEvidencePacket['agentConfig'];
        semanticContext: AiAgentReviewJudgeEvidencePacket['semanticContext'];
        threadWritebackPullRequests: AiAgentReviewJudgeEvidencePacket['threadWritebackPullRequests'];
        existingReviewItems: AiAgentReviewItemDedupCandidate[];
    }): AiAgentReviewJudgeEvidencePacket {
        return {
            subject: candidate.subject,
            interactionSource: candidate.interactionSource,
            targetTurn: candidate.targetTurn,
            humanFeedback: {
                score: candidate.humanScore,
                comment: candidate.humanFeedback,
            },
            agentConfig,
            semanticContext,
            nextUserPrompt: candidate.nextUserPrompt
                ? {
                      promptUuid: candidate.nextUserPromptUuid,
                      text: candidate.nextUserPrompt,
                  }
                : null,
            previousTurns: candidate.contextTurns.slice(-3),
            queryHistory: candidate.queryHistory.map((queryHistory) => ({
                queryUuid: queryHistory.queryUuid,
                status: queryHistory.status,
                error: queryHistory.error,
                metricQuery: queryHistory.metricQuery,
                totalRowCount: queryHistory.totalRowCount,
                warehouseExecutionTimeMs: queryHistory.warehouseExecutionTimeMs,
            })),
            supportingEvidence: candidate.supportingEvidence.map(
                (evidence) => ({
                    ...evidence,
                    summary:
                        AiAgentReviewClassifierService.buildSupportingEvidenceText(
                            evidence,
                        ),
                }),
            ),
            suggestedEvidenceExcerpts:
                AiAgentReviewClassifierService.buildEvidenceExcerpts(candidate),
            threadWritebackPullRequests,
            toolOutcomes: candidate.toolOutcomes,
            pendingApprovalTimeout: candidate.pendingApprovalTimeout,
            existingReviewItems,
        };
    }

    private static buildContextTurnText(
        contextTurn: AiAgentReviewClassifierTurnCandidate['contextTurns'][number],
    ): string {
        const response =
            contextTurn.assistantResponse ??
            contextTurn.errorMessage ??
            'No assistant response captured.';

        return `${contextTurn.relation} turn (${contextTurn.promptUuid}): prompt=${truncate(contextTurn.userPrompt, 320)} response=${truncate(response, 480)}`;
    }

    private static buildSupportingEvidenceText(
        evidence: AiAgentReviewClassifierTurnCandidate['supportingEvidence'][number],
    ): string {
        const subagentPrefix = evidence.parentToolCallId
            ? 'Subagent tool trace'
            : 'Tool trace';
        const args = evidence.toolArgsPreview
            ? ` args=${truncate(evidence.toolArgsPreview, 320)}`
            : '';
        const result = evidence.resultPreview
            ? ` result=${truncate(evidence.resultPreview, 480)}`
            : '';

        return `${subagentPrefix}: ${evidence.toolName} (${evidence.toolCallId}).${args}${result}`;
    }

    private static getRelevantCatalogMatches({
        catalogItems,
        candidate,
        queriedExploreNames,
        queriedFieldNames,
    }: {
        catalogItems: CatalogItemSummary[];
        candidate: AiAgentReviewClassifierTurnCandidate;
        queriedExploreNames: string[];
        queriedFieldNames: string[];
    }): AiAgentReviewCatalogEvidenceItem[] {
        const promptTerms = AiAgentReviewClassifierService.extractSearchTerms(
            [
                candidate.userPrompt,
                candidate.nextUserPrompt,
                candidate.humanFeedback,
                ...candidate.contextTurns.map((turn) => turn.userPrompt),
            ]
                .filter((value): value is string => !!value)
                .join(' '),
        );
        const queriedFields = new Set(
            queriedFieldNames.map((fieldName) => fieldName.toLowerCase()),
        );
        const queriedExplores = new Set(
            queriedExploreNames.map((exploreName) => exploreName.toLowerCase()),
        );

        return catalogItems
            .map((item) => {
                const searchableText = [
                    item.name,
                    item.label,
                    item.description,
                    item.tableName,
                ]
                    .filter((value): value is string => !!value)
                    .join(' ')
                    .toLowerCase();
                const exactFieldMatch = queriedFields.has(
                    item.name.toLowerCase(),
                );
                const exactExploreMatch =
                    item.type === CatalogType.Table &&
                    queriedExplores.has(item.name.toLowerCase());
                const promptTermScore = promptTerms.filter((term) =>
                    searchableText.includes(term),
                ).length;

                return {
                    item,
                    score:
                        (exactFieldMatch ? 100 : 0) +
                        (exactExploreMatch ? 80 : 0) +
                        promptTermScore,
                };
            })
            .filter(({ score }) => score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 20)
            .map(({ item }) => ({
                name: item.name,
                label: item.label ?? null,
                type: item.type,
                tableName: item.tableName ?? null,
                fieldType: item.fieldType ?? null,
                description: item.description ?? null,
            }));
    }

    private static extractSearchTerms(input: string): string[] {
        const stopWords = new Set([
            'the',
            'and',
            'for',
            'with',
            'from',
            'what',
            'show',
            'give',
            'tell',
            'our',
            'this',
            'that',
            'use',
            'not',
        ]);

        return [
            ...new Set(
                input
                    .toLowerCase()
                    .split(/[^a-z0-9_]+/)
                    .filter((term) => term.length >= 3 && !stopWords.has(term)),
            ),
        ].slice(0, 25);
    }

    private static buildReport({
        dryRun,
        reviewedTurns,
    }: {
        dryRun: boolean;
        reviewedTurns: AiAgentReviewClassifierReviewedTurn[];
    }): AiAgentReviewClassifierExperimentReport {
        const signalsByType: Partial<Record<AiAgentTurnSignal, number>> = {};
        const findingsByRootCause: Partial<Record<AiAgentRootCause, number>> =
            {};
        reviewedTurns.forEach(({ classifiedTurn }) => {
            signalsByType[classifiedTurn.signal.signal] =
                (signalsByType[classifiedTurn.signal.signal] ?? 0) + 1;

            if (classifiedTurn.finding) {
                findingsByRootCause[classifiedTurn.finding.primaryRootCause] =
                    (findingsByRootCause[
                        classifiedTurn.finding.primaryRootCause
                    ] ?? 0) + 1;
            }
        });

        const examples = reviewedTurns
            .filter(
                ({ classifiedTurn }) =>
                    classifiedTurn.signal.promotedToFinding ||
                    classifiedTurn.finding,
            )
            .slice(0, 10)
            .map(({ candidate, classifiedTurn }) => ({
                promptUuid: candidate.subject.assistantPromptUuid,
                signal: classifiedTurn.signal.signal,
                rootCause: classifiedTurn.finding?.primaryRootCause ?? null,
                evidence: classifiedTurn.finding?.evidenceExcerpts.map(
                    (evidence) => evidence.text,
                ) ?? [candidate.userPrompt],
                queryStatuses: candidate.queryHistory.map(
                    (queryHistory) => queryHistory.status,
                ),
                supportingEvidence: candidate.supportingEvidence.map(
                    AiAgentReviewClassifierService.buildSupportingEvidenceText,
                ),
            }));

        return {
            dryRun,
            totalCandidates: reviewedTurns.length,
            signalsByType,
            findingsByRootCause,
            examples,
        };
    }
}

const truncate = (input: string, maxLength = 1200): string =>
    input.length > maxLength ? `${input.slice(0, maxLength)}...` : input;

const hashText = (input: string): string =>
    createHash('sha256').update(input).digest('hex');
