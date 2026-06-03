import {
    aiAgentReviewClassifierJudgeOutputSchema,
    getAiAgentConfigSnapshotHash,
    getAiAgentReviewItemFingerprint,
    type AiAgentAvailableCapability,
    type AiAgentConfigSnapshot,
    type AiAgentConfigurationSetting,
    type AiAgentEvidenceExcerpt,
    type AiAgentReviewClassifierEventType,
    type AiAgentReviewClassifierJudgeOutput,
    type AiAgentReviewClassifierRunScope,
    type AiAgentReviewClassifierSignalFinding,
    type AiAgentReviewClassifierTurnCandidate,
    type AiAgentReviewClassifierTurnSignal,
    type AiAgentRootCause,
    type AiAgentTargetRef,
    type AiAgentTurnSignal,
} from '@lightdash/ai';
/* eslint-disable @typescript-eslint/no-use-before-define */
import {
    CatalogType,
    FeatureFlags,
    ForbiddenError,
    type CatalogItemSummary,
    type QueryHistoryStatus,
} from '@lightdash/common';
import { generateObject } from 'ai';
import { createHash } from 'crypto';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { type CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { BaseService } from '../../services/BaseService';
import { type FeatureFlagService } from '../../services/FeatureFlag/FeatureFlagService';
import { type AiAgentModel } from '../models/AiAgentModel';
import { type AiAgentReviewClassifierModel } from '../models/AiAgentReviewClassifierModel';
import { defaultAgentOptions } from './ai/agents/agentV2';
import { getModel } from './ai/models';

const REVIEW_AGENT_VERSION = 'llm-judge-v1';
const JUDGE_PROMPT_HASH = 'ai-agent-review-judge-v2';

type AiAgentReviewClassifierJudge = (
    candidate: AiAgentReviewClassifierTurnCandidate,
    evidencePacket: AiAgentReviewJudgeEvidencePacket,
) => Promise<AiAgentReviewClassifierJudgeOutput>;

type AiAgentReviewClassifierJudgeTargetRef =
    AiAgentReviewClassifierJudgeOutput['targetRefs'][number];

type AiAgentReviewClassifierServiceDependencies = {
    aiAgentReviewClassifierModel: AiAgentReviewClassifierModel;
    aiAgentModel: AiAgentModel;
    catalogModel: Pick<CatalogModel, 'getCatalogItemsSummary'>;
    featureFlagService: FeatureFlagService;
    lightdashConfig: LightdashConfig;
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

type AiAgentReviewJudgeEvidencePacket = {
    subject: AiAgentReviewClassifierTurnCandidate['subject'];
    interactionSource: AiAgentReviewClassifierTurnCandidate['interactionSource'];
    targetTurn: AiAgentReviewClassifierTurnCandidate['targetTurn'];
    reviewHints: AiAgentReviewClassifierTurnCandidate['reviewHints'];
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
        instructionSummary: string | null;
        knowledgeDocumentCount: number;
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
};

type AiAgentReviewAgentConfigEvidence =
    AiAgentReviewJudgeEvidencePacket['agentConfig'] & {
        snapshot: AiAgentConfigSnapshot | null;
        agentUpdatedAt: Date | null;
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

export class AiAgentReviewClassifierService extends BaseService {
    private readonly aiAgentReviewClassifierModel: AiAgentReviewClassifierModel;

    private readonly aiAgentModel: AiAgentModel;

    private readonly catalogModel: Pick<CatalogModel, 'getCatalogItemsSummary'>;

    private readonly featureFlagService: FeatureFlagService;

    private readonly lightdashConfig: LightdashConfig;

    private readonly judgeTurn: AiAgentReviewClassifierJudge;

    constructor(dependencies: AiAgentReviewClassifierServiceDependencies) {
        super();
        this.aiAgentReviewClassifierModel =
            dependencies.aiAgentReviewClassifierModel;
        this.aiAgentModel = dependencies.aiAgentModel;
        this.catalogModel = dependencies.catalogModel;
        this.featureFlagService = dependencies.featureFlagService;
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

    async runLiveEvent(
        args: RunLiveEventArgs,
    ): Promise<AiAgentReviewClassifierRunResult | null> {
        const candidates =
            await this.aiAgentReviewClassifierModel.listTurnReviewCandidates({
                organizationUuid: args.organizationUuid,
                projectUuid: args.projectUuid,
                agentUuid: args.agentUuid,
                threadUuid: args.threadUuid,
                promptUuid: args.promptUuid,
                limit: 1,
            });

        this.debugLog('LiveEventCandidatesLoaded', {
            eventType: args.eventType,
            organizationUuid: args.organizationUuid,
            projectUuid: args.projectUuid,
            agentUuid: args.agentUuid,
            threadUuid: args.threadUuid,
            promptUuid: args.promptUuid,
            candidateCount: candidates?.length ?? 0,
        });

        return this.processCandidates({
            organizationUuid: args.organizationUuid,
            organizationName: args.organizationName,
            requestedByUserUuid: args.requestedByUserUuid,
            candidates: candidates.map((candidate) => ({
                ...candidate,
                reviewHints: {
                    ...candidate.reviewHints,
                    useTargetPromptAsCorrectionEvidence:
                        args.eventType === 'response_saved',
                },
            })),
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

        const runAgentConfig = args.candidates[0]
            ? await this.captureAgentConfigSnapshot(args.candidates[0])
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
        const shouldPersistSignals = args.persistSignals ?? !args.dryRun;
        const shouldPersistFindings = !args.dryRun && !!args.persistFindings;
        const shouldPromoteFindingsToReviewItems =
            shouldPersistFindings && !!args.promoteFindingsToReviewItems;

        try {
            const reviewedTurns = await Promise.all(
                args.candidates.map(async (candidate) => ({
                    candidate,
                    classifiedTurn: await this.classifyTurnWithJudge(
                        candidate,
                        runAgentConfig,
                    ),
                })),
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
                if (shouldPersistSignals) {
                    await this.aiAgentReviewClassifierModel.createTurnSignal({
                        runUuid: run.uuid,
                        turnSignal: classifiedTurn.signal,
                        finding: shouldPersistFindings
                            ? classifiedTurn.finding
                            : null,
                    });
                }
                signalCount += 1;

                if (shouldPersistFindings && classifiedTurn.finding) {
                    findingCount += 1;
                    if (shouldPromoteFindingsToReviewItems) {
                        reviewItemFingerprints.add(
                            classifiedTurn.finding.reviewItem.fingerprint,
                        );
                        reviewItemCount = reviewItemFingerprints.size;
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

    private async classifyTurnWithJudge(
        candidate: AiAgentReviewClassifierTurnCandidate,
        agentConfig: AiAgentReviewAgentConfigEvidence,
    ): Promise<AiAgentReviewClassifierClassifiedTurn> {
        const reviewEvidence = await this.buildReviewEvidence(
            candidate,
            agentConfig,
        );
        const judgeOutput = await this.judgeTurn(
            candidate,
            reviewEvidence.evidencePacket,
        );
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

        const fingerprint = getAiAgentReviewItemFingerprint({
            organizationUuid: candidate.subject.organizationUuid,
            projectUuid: candidate.subject.projectUuid,
            agentUuid: candidate.subject.agentUuid,
            primaryRootCause: judgeOutput.primaryRootCause,
            subcategories: judgeOutput.subcategories,
            fixTargets: judgeOutput.fixTargets,
            targetRefs,
            agentConfigurationSettings: judgeOutput.agentConfigurationSettings,
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
    }> {
        const semanticContext = await this.buildSemanticContext(candidate);

        return {
            agentConfig,
            evidencePacket:
                AiAgentReviewClassifierService.buildJudgeEvidencePacket({
                    candidate,
                    agentConfig,
                    semanticContext,
                }),
        };
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

            const instruction = agent.instruction ?? null;
            const settings = [
                instruction ? 'instructions' : null,
                'data_access',
                agent.enableSelfImprovement ? 'self_improvement' : null,
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
                'data_value_search',
                ...(agent.enableDataAccess
                    ? (['chart_data_access'] as const)
                    : []),
                ...(agent.enableSelfImprovement
                    ? (['context_improvement'] as const)
                    : []),
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
                    ? truncate(instruction, 500)
                    : null,
                knowledgeDocuments: [],
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
                instructionSummary: snapshot.instructionSummary,
                knowledgeDocumentCount: snapshot.knowledgeDocuments.length,
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
            instructionSummary: null,
            knowledgeDocumentCount: 0,
        };
    }

    private async buildSemanticContext(
        candidate: AiAgentReviewClassifierTurnCandidate,
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
            const catalogItems = await this.catalogModel.getCatalogItemsSummary(
                candidate.subject.projectUuid,
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
        const model = getModel(this.lightdashConfig.ai.copilot, {
            useFastModel: true,
        });

        this.debugLog('JudgeRequest', {
            promptUuid: candidate.subject.assistantPromptUuid,
            threadUuid: candidate.subject.threadUuid,
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

        const result = await generateObject({
            model: model.model,
            ...defaultAgentOptions,
            ...model.callOptions,
            providerOptions: model.providerOptions,
            schema: aiAgentReviewClassifierJudgeOutputSchema,
            messages: [
                {
                    role: 'system',
                    content: `You are an LLM-as-judge review agent for Lightdash AI analyst turns.

Classify whether the assistant turn contains an actionable issue. Use only the supplied evidence packet. Do not invent project fields or facts.

Root cause definitions:
- semantic_layer: dbt/Lightdash YAML model, dimension, metric, join, filter, or AI hint should change.
- project_context: available explores, project context, or knowledge about which explore to use is missing/wrong.
- agent_configuration: Lightdash agent settings should change, e.g. instructions, knowledge docs, data access, SQL mode, MCP, access.
- data_gap: underlying warehouse/dbt data is missing or insufficient.
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
- tool_error: a tool call errored, timed out, or returned an empty / error result the assistant did not recover from.
- product_capability_request: the user asked for something Lightdash cannot currently express.
- human_intervention: an admin or engineer had to step in.

Decision rules — apply in order:

1. First, populate implicitSignalSources by inspecting the evidence packet. Do not skip this step.

2. Treat implicitSignalSources as strong evidence of unresolved user intent, not as decoration. Promote when the implicit signal points to likely assistant failure:
   - Always promote assistant_no_answer, next_user_dispute, tool_error, product_capability_request, and human_intervention.
   - Promote next_user_correction when the correction is about field choice, metric choice, explore/source selection, scoping, business definition, missing data, or whether the assistant can connect the requested data.
   - Promote next_user_retry only when the previous answer was failed, empty, non-substantive, off-target, or only offered a workaround instead of answering the user's actual question.
   - Do not promote output_shape_correction alone, routine drill-downs, normal follow-up questions, or chart/format-only changes when the assistant answered the user's actual question.

When promoting, pick primaryRootCause by mapping the dominant signal:
   - assistant_no_answer where the assistant names a missing join, missing column, missing relationship, or missing field → semantic_layer.
   - assistant_no_answer where the assistant picked a wrong / unrelated explore or field → project_context.
   - assistant_no_answer due to disabled SQL or data access, missing instructions, or missing knowledge docs → agent_configuration.
   - assistant_no_answer because the warehouse genuinely lacks the data → data_gap.
   - assistant_no_answer because Lightdash cannot express the question (missing chart type, unsupported pivot, etc.) → product_capability.
   - next_user_correction or next_user_dispute about field choice, scoping, or definition → semantic_layer or project_context.
   - next_user_retry after a failed or empty answer → runtime_reliability or agent_configuration depending on cause.
   - tool_error → runtime_reliability.
   - product_capability_request → product_capability.
   - human_intervention → agent_configuration unless evidence clearly points elsewhere.

3. Only set promotedToFinding=false when there is no promotable implicit signal AND the assistant answered the user's actual question. In that case use signal=acceptance_or_continuation, new_question, output_shape_correction, or normal_refinement and primaryRootCause=not_a_failure.

4. Successful queries can still be findings even without implicit signals when the user asked broad business language and the semantic / catalog context does not clearly support the selected field, explore, or metric. Promote those as semantic_layer or project_context when a model definition, AI hint, or project context rule would prevent future ambiguity.

5. Use agentConfig to catch Lightdash-layer fixes: missing instructions, disabled data access, missing knowledge docs, access restrictions, or capability settings. Promote those as agent_configuration when the answer quality depends on agent setup.

6. If you would promote but cannot pick one primaryRootCause confidently, set primaryRootCause=ambiguous with confidence=low or medium and still promote.

When promotedToFinding=true, provide concise evidence excerpts copied or summarized from the packet and a practical recommendation.
Use one primaryRootCause. Secondary causes are optional.
For targetRefs, return compact refs:
- type: one of the allowed target types.
- label: short human-readable target.
- modelName: dbt/Lightdash model when known, otherwise null.
- fieldName: dimension/metric/join/explore/filter name when known, otherwise null.
- setting: agent config setting for agent_config targets, otherwise null.
- key: runtime/product capability key when useful, otherwise null.
reviewItem.title should be concise and admin-facing.
reviewItem.description should summarize why this grouping exists.`,
                },
                {
                    role: 'user',
                    content: JSON.stringify(evidencePacket, null, 2),
                },
            ],
        });

        return result.object as AiAgentReviewClassifierJudgeOutput;
    }

    private async isEnabled(args: {
        requestedByUserUuid?: string;
        organizationUuid: string;
        organizationName?: string;
    }): Promise<boolean> {
        const featureFlag = await this.featureFlagService.get({
            featureFlagId: FeatureFlags.AiAgentReviewClassifier,
            user: {
                userUuid: args.requestedByUserUuid ?? 'system',
                organizationUuid: args.organizationUuid,
                organizationName: args.organizationName ?? '',
            },
        });

        return featureFlag.enabled;
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

    private static buildJudgeEvidencePacket({
        candidate,
        agentConfig,
        semanticContext,
    }: {
        candidate: AiAgentReviewClassifierTurnCandidate;
        agentConfig: AiAgentReviewJudgeEvidencePacket['agentConfig'];
        semanticContext: AiAgentReviewJudgeEvidencePacket['semanticContext'];
    }): AiAgentReviewJudgeEvidencePacket {
        return {
            subject: candidate.subject,
            interactionSource: candidate.interactionSource,
            targetTurn: candidate.targetTurn,
            reviewHints: candidate.reviewHints,
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
