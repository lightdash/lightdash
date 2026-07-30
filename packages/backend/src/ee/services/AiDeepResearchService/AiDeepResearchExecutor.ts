import {
    getErrorMessage,
    type AiAgentToolCall,
    type AiAgentToolResult,
    type AiDeepResearchActivity,
    type AiDeepResearchBudget,
    type AiDeepResearchHypothesis,
    type AiDeepResearchInvestigation,
    type AiDeepResearchInvestigationReport,
    type AiDeepResearchPhase,
    type AiDeepResearchProgress,
    type AiDeepResearchSubmittedReport,
    type SessionUser,
} from '@lightdash/common';
import { validate as isUuid } from 'uuid';
import Logger from '../../../logging/logger';
import type { UserService } from '../../../services/UserService';
import type { DbAiDeepResearchRun } from '../../database/entities/aiDeepResearch';
import type { AiAgentModel } from '../../models/AiAgentModel';
import type { AiDeepResearchRunModel } from '../../models/AiDeepResearchRunModel';
import { DeepResearchInvestigationTargetReachedError } from '../ai/deepResearchErrors';
import type { AiAgentService } from '../AiAgentService/AiAgentService';
import {
    AI_DEEP_RESEARCH_HYPOTHESES_TOOL_NAME,
    AI_DEEP_RESEARCH_INVESTIGATION_TOOL_NAME,
    AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
    getAiDeepResearchPhaseBudgets,
    parseAiDeepResearchReport,
} from './AiDeepResearchAgent';
import { getDeepResearchCheckpoint } from './AiDeepResearchCheckpoint';
import {
    getAiDeepResearchRunBudget,
    type AiDeepResearchExecutor as AiDeepResearchExecutorFn,
    type AiDeepResearchExecutorResult,
} from './AiDeepResearchService';
import {
    isDeepResearchWarehouseMcpTool,
    isDeepResearchWarehouseTool,
} from './toolClassification';

const CANCELLATION_POLL_INTERVAL_MS = 1_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const ACCESS_RECHECK_INTERVAL_MS = 15_000;
const SUBMISSION_TOOL_NAMES = new Set([
    AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
    AI_DEEP_RESEARCH_HYPOTHESES_TOOL_NAME,
    AI_DEEP_RESEARCH_INVESTIGATION_TOOL_NAME,
]);
const SOFT_LIMIT_MS = 30 * 60 * 1_000;
const EVIDENCE_VALUE_MAX_CHARS = 120;
const EVIDENCE_FACTS_PER_TOOL = 6;
const MAX_COMPACT_EVIDENCE_TOOLS = 40;
const WAVE_CONCLUSION_MAX_CHARS = 2_000;
const SENSITIVE_EVIDENCE_PATTERN =
    /(?:api[\s_-]*key|authorization|bearer|credential|password|passwd|private[\s_-]*key|secret|token)/i;

type InvestigationWorkflow = {
    waves: number;
    plannerSteps: number;
    investigatorSteps: number;
    maxHypotheses: number;
    maxModelSteps: number;
    targetToolCalls: number;
    targetWarehouseQueries: number;
};

type ToolProvenance = {
    toolCall: AiAgentToolCall;
    toolResult: AiAgentToolResult | null;
};

const getInvestigationWorkflow = (
    budget: AiDeepResearchBudget,
): InvestigationWorkflow => {
    if (budget.maxToolCalls <= 50) {
        return {
            waves: 2,
            plannerSteps: 1,
            investigatorSteps: 5,
            maxHypotheses: Math.min(2, budget.maxHypotheses),
            maxModelSteps: 1 + Math.min(2, budget.maxHypotheses) * 5 + 2,
            targetToolCalls: 15,
            targetWarehouseQueries: Math.min(8, budget.maxWarehouseQueries),
        };
    }
    if (budget.maxToolCalls <= 125) {
        return {
            waves: 3,
            plannerSteps: 1,
            investigatorSteps: 7,
            maxHypotheses: Math.min(3, budget.maxHypotheses),
            maxModelSteps: 1 + Math.min(3, budget.maxHypotheses) * 7 + 2,
            targetToolCalls: 30,
            targetWarehouseQueries: Math.min(15, budget.maxWarehouseQueries),
        };
    }
    if (budget.maxToolCalls <= 250) {
        return {
            waves: 3,
            plannerSteps: 1,
            investigatorSteps: 9,
            maxHypotheses: Math.min(3, budget.maxHypotheses),
            maxModelSteps: 1 + Math.min(3, budget.maxHypotheses) * 9 + 2,
            targetToolCalls: 50,
            targetWarehouseQueries: Math.min(25, budget.maxWarehouseQueries),
        };
    }
    return {
        waves: 3,
        plannerSteps: 1,
        investigatorSteps: 12,
        maxHypotheses: Math.min(3, budget.maxHypotheses),
        maxModelSteps: 1 + Math.min(3, budget.maxHypotheses) * 12 + 2,
        targetToolCalls: 75,
        targetWarehouseQueries: Math.min(40, budget.maxWarehouseQueries),
    };
};

const truncateEvidence = (value: string, maxChars: number): string =>
    value.length <= maxChars ? value : `${value.slice(0, maxChars)}…`;

const getSafeReportText = (value: string): string =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('`', "'")
        .replace(/\s+/g, ' ')
        .trim();

const parseJson = (value: string): unknown => {
    try {
        return JSON.parse(value) as unknown;
    } catch {
        return value;
    }
};

const findStringValues = (value: unknown, key: string): string[] => {
    if (Array.isArray(value)) {
        return value.flatMap((item) => findStringValues(item, key));
    }
    if (value === null || typeof value !== 'object') {
        return [];
    }

    return Object.entries(value).flatMap(([entryKey, entryValue]) => [
        ...(entryKey === key && typeof entryValue === 'string'
            ? [entryValue]
            : []),
        ...findStringValues(entryValue, key),
    ]);
};

const hasSuccessfulToolResult = ({ toolResult }: ToolProvenance): boolean => {
    if (!toolResult || typeof toolResult.metadata !== 'object') {
        return false;
    }

    return toolResult.metadata?.status === 'success';
};

const getQueryUuids = (provenance: ToolProvenance[]): string[] => [
    ...new Set(
        provenance.flatMap((entry) =>
            hasSuccessfulToolResult(entry) &&
            entry.toolResult &&
            isDeepResearchWarehouseTool(entry.toolResult.toolName)
                ? findStringValues(
                      parseJson(entry.toolResult.result),
                      'queryUuid',
                  ).filter(isUuid)
                : [],
        ),
    ),
];

const getEvidenceFacts = (value: unknown, path = 'result'): string[] => {
    if (SENSITIVE_EVIDENCE_PATTERN.test(path)) {
        return [];
    }
    if (
        value === null ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    ) {
        return [`${path}=${String(value)}`];
    }
    if (typeof value === 'string') {
        const safeValue = SENSITIVE_EVIDENCE_PATTERN.test(value)
            ? '[REDACTED]'
            : truncateEvidence(value, EVIDENCE_VALUE_MAX_CHARS);
        return [`${path}=${safeValue}`];
    }
    if (Array.isArray(value)) {
        return value
            .slice(0, 3)
            .flatMap((item, index) =>
                getEvidenceFacts(item, `${path}[${index}]`),
            )
            .slice(0, EVIDENCE_FACTS_PER_TOOL);
    }
    if (typeof value !== 'object') {
        return [];
    }

    return Object.entries(value)
        .filter(
            ([key]) =>
                key !== 'queryUuid' &&
                !/(?:metadata|schema)/i.test(key) &&
                !SENSITIVE_EVIDENCE_PATTERN.test(key),
        )
        .flatMap(([key, item]) => getEvidenceFacts(item, `${path}.${key}`))
        .slice(0, EVIDENCE_FACTS_PER_TOOL);
};

const getCompactedEvidence = ({
    provenance,
    waveConclusions,
}: {
    provenance: ToolProvenance[];
    waveConclusions: string[];
}): string => {
    const evidence = provenance
        .filter(
            (entry) =>
                entry.toolCall.toolName !== AI_DEEP_RESEARCH_REPORT_TOOL_NAME &&
                hasSuccessfulToolResult(entry),
        )
        .slice(-MAX_COMPACT_EVIDENCE_TOOLS)
        .map(({ toolCall, toolResult }, index) => {
            const queryUuids = getQueryUuids([{ toolCall, toolResult }]);
            const facts = toolResult
                ? getEvidenceFacts(parseJson(toolResult.result))
                : ['Tool result unavailable.'];
            return [
                `${index + 1}. ${toolCall.toolName} (${toolCall.toolCallId})`,
                ...(queryUuids.length > 0
                    ? [`   Query UUIDs: ${queryUuids.join(', ')}`]
                    : []),
                ...facts.map((fact) => `   ${fact}`),
            ].join('\n');
        });
    const conclusions = waveConclusions.map(
        (conclusion, index) =>
            `${index + 1}. ${truncateEvidence(
                conclusion,
                WAVE_CONCLUSION_MAX_CHARS,
            )}`,
    );

    return [
        'Use this compact evidence checkpoint instead of reconstructing prior tool history.',
        'Preserve its measured values, query UUIDs, caveats, and provenance. Treat conclusions as provisional and validate conflicts.',
        conclusions.length > 0
            ? `\nWave conclusions:\n${conclusions.join('\n')}`
            : '',
        evidence.length > 0
            ? `\nEvidence provenance:\n${evidence.join('\n')}`
            : '\nNo evidence has been collected yet.',
    ].join('\n');
};

const getEvidencePartialReport = ({
    run,
    provenance,
    reason,
}: {
    run: DbAiDeepResearchRun;
    provenance: ToolProvenance[];
    reason: string;
}): AiDeepResearchSubmittedReport => {
    const successfulProvenance = provenance.filter(hasSuccessfulToolResult);
    const evidence = successfulProvenance
        .filter(({ toolCall }) => !SUBMISSION_TOOL_NAMES.has(toolCall.toolName))
        .slice(-MAX_COMPACT_EVIDENCE_TOOLS)
        .flatMap(({ toolCall, toolResult }) => {
            if (!toolResult) {
                return [];
            }
            const facts = getEvidenceFacts(parseJson(toolResult.result));
            return facts.map(
                (fact) =>
                    `- \`${toolCall.toolName}\`: ${truncateEvidence(
                        getSafeReportText(fact),
                        EVIDENCE_VALUE_MAX_CHARS,
                    )}`,
            );
        });
    const queryUuids = getQueryUuids(successfulProvenance);

    return {
        markdown: `This is a partial report based only on evidence persisted before the investigation stopped. Its conclusions should be treated as incomplete.

<warning title="Incomplete investigation">

${reason}

</warning>

## Evidence collected

<confidence level="low">The evidence is incomplete because report synthesis did not pass validation.</confidence>

${evidence.length > 0 ? evidence.join('\n') : '- No validated evidence was persisted.'}
${
    queryUuids.length > 0
        ? `\n\nWarehouse queries:\n${queryUuids.map((uuid) => `- \`${uuid}\``).join('\n')}`
        : ''
}

## Conclusion

- This partial result preserves the evidence collected for: ${getSafeReportText(run.prompt)}`,
        charts: [],
    };
};

const getInvestigationDirective = ({
    workflow,
    wave,
    compactedEvidence,
}: {
    workflow: InvestigationWorkflow;
    wave: number;
    compactedEvidence: string;
}): string =>
    [
        `Investigation wave ${wave} of ${workflow.waves}.`,
        `Aim for about ${workflow.targetToolCalls} useful tool calls and ${workflow.targetWarehouseQueries} warehouse queries across the whole investigation, within the hard effort budget.`,
        `The complete workflow is capped near ${workflow.maxModelSteps} model steps.`,
        `For each hypothesis, use at most the first two model steps for schema discovery. Use the remaining ${Math.max(workflow.investigatorSteps - 3, 1)} exploration steps to execute measured warehouse queries and cross-check the result; the runtime reserves the final step for submitting your report.`,
        'A hypothesis report without measured warehouse evidence is invalid unless the required data genuinely does not exist. Batch independent tool calls in the same model step and aim for four focused warehouse queries per hypothesis.',
        'Use this wave to test a distinct hypothesis or fill the most important evidence gap.',
        compactedEvidence,
    ].join('\n\n');

type Dependencies = {
    aiAgentService: Pick<
        AiAgentService,
        'assertDeepResearchAccess' | 'generateAgentThreadResponse'
    >;
    aiAgentModel: Pick<AiAgentModel, 'getToolCallsAndResultsForPrompt'>;
    aiDeepResearchRunModel: Pick<
        AiDeepResearchRunModel,
        | 'appendProgressEvent'
        | 'findByUuid'
        | 'touch'
        | 'updateExecutionContextSnapshot'
    >;
    userService: Pick<UserService, 'getSessionByUserUuidAndOrg'>;
};

const getLatestReport = (
    provenance: ToolProvenance[],
): AiDeepResearchSubmittedReport | null => {
    const submissions = provenance.filter(
        ({ toolCall }) =>
            toolCall.toolName === AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
    );
    for (let index = submissions.length - 1; index >= 0; index -= 1) {
        try {
            return parseAiDeepResearchReport(
                submissions[index].toolCall.toolArgs,
            );
        } catch {
            // Invalid drafts are returned to the model for correction.
        }
    }
    return null;
};

const getPartialReport = (
    run: DbAiDeepResearchRun,
    reason: string,
): AiDeepResearchSubmittedReport => ({
    markdown: `This is a partial report because the investigation stopped before full synthesis. Its conclusions should be treated as incomplete.

<warning title="Incomplete investigation">

${reason}

</warning>

## Investigation status

<confidence level="low">The available evidence is incomplete.</confidence>

- The investigation stopped while researching: ${getSafeReportText(run.prompt)}

## Conclusion

- Run Deep Research again with a larger depth to continue investigating: ${getSafeReportText(run.prompt)}`,
    charts: [],
});

const getActivity = (toolName: string): AiDeepResearchActivity => {
    if (SUBMISSION_TOOL_NAMES.has(toolName)) {
        return 'reporting';
    }
    if (isDeepResearchWarehouseTool(toolName)) {
        return 'warehouse_query';
    }
    return 'lightdash_metadata';
};

export class AiDeepResearchExecutor {
    private readonly dependencies: Dependencies;

    constructor(dependencies: Dependencies) {
        this.dependencies = dependencies;
    }

    private startRunMonitor(
        run: DbAiDeepResearchRun,
        controller: AbortController,
        onCancellation: () => void,
        onAuthorizationRevoked: (reason: string) => void,
    ): () => Promise<void> {
        let stopped = false;
        let cancellationTimer: NodeJS.Timeout | null = null;
        let pendingCancellationCheck: Promise<void> = Promise.resolve();
        let pendingAuthorizationCheck: Promise<void> = Promise.resolve();
        let authorizationCheckInFlight = false;

        const scheduleCancellationCheck = () => {
            if (stopped || controller.signal.aborted) {
                return;
            }
            cancellationTimer = setTimeout(() => {
                pendingCancellationCheck =
                    this.dependencies.aiDeepResearchRunModel
                        .findByUuid(run.ai_deep_research_run_uuid)
                        .then((currentRun) => {
                            if (currentRun?.cancellation_requested_at) {
                                onCancellation();
                                controller.abort(
                                    new Error('Deep Research was cancelled'),
                                );
                            }
                        })
                        .catch((error) => {
                            Logger.warn(
                                `[AiDeepResearch] Could not check cancellation: ${getErrorMessage(error)}`,
                            );
                        })
                        .finally(scheduleCancellationCheck);
            }, CANCELLATION_POLL_INTERVAL_MS);
            cancellationTimer.unref();
        };

        scheduleCancellationCheck();
        const heartbeat = setInterval(() => {
            void this.dependencies.aiDeepResearchRunModel
                .touch(run.ai_deep_research_run_uuid)
                .catch((error) => {
                    Logger.warn(
                        `[AiDeepResearch] Could not update heartbeat: ${getErrorMessage(error)}`,
                    );
                });
        }, HEARTBEAT_INTERVAL_MS);
        heartbeat.unref();

        const authorizationCheck = setInterval(() => {
            if (controller.signal.aborted || authorizationCheckInFlight) {
                return;
            }
            authorizationCheckInFlight = true;
            pendingAuthorizationCheck = this.dependencies.userService
                .getSessionByUserUuidAndOrg(
                    run.created_by_user_uuid,
                    run.organization_uuid,
                )
                .then((currentUser) =>
                    this.dependencies.aiAgentService.assertDeepResearchAccess(
                        currentUser,
                        {
                            agentUuid: run.agent_uuid,
                            organizationUuid: run.organization_uuid,
                            projectUuid: run.project_uuid,
                            threadUuid: run.ai_thread_uuid,
                        },
                    ),
                )
                .catch((error) => {
                    const reason =
                        getErrorMessage(error) ||
                        'Deep Research could not revalidate the creator’s access';
                    onAuthorizationRevoked(reason);
                    controller.abort(new Error(reason));
                })
                .finally(() => {
                    authorizationCheckInFlight = false;
                });
        }, ACCESS_RECHECK_INTERVAL_MS);
        authorizationCheck.unref();

        return async () => {
            stopped = true;
            if (cancellationTimer) {
                clearTimeout(cancellationTimer);
            }
            clearInterval(heartbeat);
            clearInterval(authorizationCheck);
            await Promise.all([
                pendingCancellationCheck,
                pendingAuthorizationCheck,
            ]);
        };
    }

    private async getProvenance(
        promptUuid: string,
        options: { includeSubagentToolCalls?: boolean } = {},
    ): Promise<ToolProvenance[]> {
        return (
            await this.dependencies.aiAgentModel.getToolCallsAndResultsForPrompt(
                promptUuid,
                options,
            )
        ).map(({ toolCall, toolResult }) => ({ toolCall, toolResult }));
    }

    execute: AiDeepResearchExecutorFn = async (
        run,
        { signal },
    ): Promise<AiDeepResearchExecutorResult> => {
        if (signal.aborted || run.cancellation_requested_at) {
            return {
                status: 'cancelled',
                terminalReason: run.cancellation_requested_at
                    ? 'user_cancellation'
                    : 'internal_error',
            };
        }

        const user: SessionUser =
            await this.dependencies.userService.getSessionByUserUuidAndOrg(
                run.created_by_user_uuid,
                run.organization_uuid,
            );
        if (!user.isActive) {
            return {
                status: 'failed',
                errorMessage:
                    'Deep Research cannot run because its creator is inactive',
                terminalReason: 'permission_revoked',
            };
        }
        try {
            await this.dependencies.aiAgentService.assertDeepResearchAccess(
                user,
                {
                    agentUuid: run.agent_uuid,
                    organizationUuid: run.organization_uuid,
                    projectUuid: run.project_uuid,
                    threadUuid: run.ai_thread_uuid,
                },
            );
        } catch (error) {
            return {
                status: 'failed',
                errorMessage: getErrorMessage(error),
                terminalReason: 'permission_revoked',
            };
        }

        const budget = getAiDeepResearchRunBudget(run.budget_snapshot);
        const phaseBudgets = getAiDeepResearchPhaseBudgets(budget);
        const controller = new AbortController();
        let cancelledByUser = false;
        let authorizationRevokedReason: string | null = null;
        let budgetExceeded: keyof typeof budget | null = null;
        const stopRunMonitor = this.startRunMonitor(
            run,
            controller,
            () => {
                cancelledByUser = true;
            },
            (reason) => {
                authorizationRevokedReason = reason;
            },
        );
        const runSignal = AbortSignal.any([signal, controller.signal]);
        const softLimitController = new AbortController();
        const softLimitTimer = setTimeout(() => {
            softLimitController.abort(
                new Error('Deep Research reached its exploration time limit'),
            );
        }, SOFT_LIMIT_MS);
        softLimitTimer.unref();
        const explorationSignal = AbortSignal.any([
            runSignal,
            softLimitController.signal,
        ]);
        const investigationSignal = explorationSignal;
        const workflow = getInvestigationWorkflow(budget);
        const effectiveToolCallLimit = Math.min(
            budget.maxToolCalls,
            workflow.targetToolCalls,
        );
        const effectiveWarehouseQueryLimit = Math.min(
            budget.maxWarehouseQueries,
            workflow.targetWarehouseQueries,
        );
        const countedToolCallIds = new Set<string>();
        let toolCalls = 0;
        let warehouseQueries = 0;
        let tokens = 0;

        const trackTokens = (stepTokens: number) => {
            tokens += stepTokens;
        };
        const trackWarehouseQuery = () => {
            warehouseQueries += 1;
            if (warehouseQueries > budget.maxWarehouseQueries) {
                budgetExceeded = 'maxWarehouseQueries';
                const error = new Error(
                    'Deep Research exceeded its warehouse-query budget',
                );
                controller.abort(error);
                throw error;
            }
        };
        const trackInvestigationWarehouseQuery = () => {
            trackWarehouseQuery();
            if (warehouseQueries > effectiveWarehouseQueryLimit) {
                throw new DeepResearchInvestigationTargetReachedError(
                    'Deep Research reached its investigation warehouse-query target',
                );
            }
        };

        // Aggregate budget accounting across every phase: the run-level
        // ceilings apply to the planner, all investigators, and the judge
        // combined, regardless of the per-phase slices in their prompts.
        const recordProgress = async (
            phase: AiDeepResearchPhase,
            toolName: string,
            toolCallId: string,
        ) => {
            if (countedToolCallIds.has(toolCallId)) {
                return;
            }
            countedToolCallIds.add(toolCallId);

            const isSubmission = SUBMISSION_TOOL_NAMES.has(toolName);
            let toolCallOrdinal = toolCalls;
            let warehouseQueryOrdinal = warehouseQueries;
            if (!isSubmission) {
                toolCalls += 1;
                toolCallOrdinal = toolCalls;
                if (isDeepResearchWarehouseMcpTool(toolName)) {
                    warehouseQueries += 1;
                    warehouseQueryOrdinal = warehouseQueries;
                }
            }

            if (toolCallOrdinal > budget.maxToolCalls) {
                budgetExceeded = 'maxToolCalls';
                const error = new Error(
                    'Deep Research exceeded its tool-call budget',
                );
                controller.abort(error);
                throw error;
            }
            if (
                phase !== 'synthesizing' &&
                toolCallOrdinal > effectiveToolCallLimit
            ) {
                throw new DeepResearchInvestigationTargetReachedError(
                    'Deep Research reached its investigation tool-call target',
                );
            }
            if (warehouseQueryOrdinal > budget.maxWarehouseQueries) {
                budgetExceeded = 'maxWarehouseQueries';
                const error = new Error(
                    'Deep Research exceeded its warehouse-query budget',
                );
                controller.abort(error);
                throw error;
            }
            if (
                phase !== 'synthesizing' &&
                warehouseQueryOrdinal > effectiveWarehouseQueryLimit
            ) {
                throw new DeepResearchInvestigationTargetReachedError(
                    'Deep Research reached its investigation warehouse-query target',
                );
            }

            const progress: AiDeepResearchProgress = {
                phase,
                activity: getActivity(toolName),
                current: toolCalls,
                total: budget.maxToolCalls,
            };
            await Promise.all([
                this.dependencies.aiDeepResearchRunModel.appendProgressEvent(
                    run.ai_deep_research_run_uuid,
                    progress,
                ),
                this.dependencies.aiDeepResearchRunModel.touch(
                    run.ai_deep_research_run_uuid,
                ),
            ]);
        };

        const makeStepProgressHandler =
            (phase: AiDeepResearchPhase) =>
            async (
                _progress: string,
                toolName?: string,
                toolCallId?: string,
                status: 'in_progress' | 'complete' | 'error' = 'in_progress',
            ) => {
                if (status === 'in_progress' && toolName && toolCallId) {
                    await recordProgress(phase, toolName, toolCallId);
                }
            };

        const runPlanner = async (): Promise<
            AiDeepResearchHypothesis[] | null
        > => {
            let hypotheses: AiDeepResearchHypothesis[] | null = null;
            await this.dependencies.aiAgentService.generateAgentThreadResponse(
                user,
                {
                    agentUuid: run.agent_uuid,
                    threadUuid: run.ai_thread_uuid,
                    promptUuid: run.prompt_uuid,
                    autoApproveSql: true,
                    toolHints: [AI_DEEP_RESEARCH_HYPOTHESES_TOOL_NAME],
                    forceToolHints: true,
                    execution: {
                        mode: 'deep_research',
                        runUuid: run.ai_deep_research_run_uuid,
                        phase: 'investigation',
                        maxSteps: workflow.plannerSteps,
                        compactedEvidence: getInvestigationDirective({
                            workflow,
                            wave: 1,
                            compactedEvidence: getCompactedEvidence({
                                provenance: [],
                                waveConclusions: [],
                            }),
                        }),
                        budget: phaseBudgets.planner,
                        selectedMcpServerUuids: [],
                        abortSignal: investigationSignal,
                        initialTokenUsage: 0,
                        onStepUsage: trackTokens,
                        onWarehouseQuery: trackWarehouseQuery,
                        research: {
                            role: 'planner',
                            maxHypotheses: workflow.maxHypotheses,
                            onHypotheses: (planned) => {
                                hypotheses = planned;
                            },
                        },
                        parentToolCallId: `deep-research:${run.ai_deep_research_run_uuid}:planner`,
                    },
                    onStepProgress: makeStepProgressHandler('planning'),
                },
            );
            return hypotheses;
        };

        const runInvestigator = async (
            hypothesis: AiDeepResearchHypothesis,
            index: number,
            compactedEvidence: string,
        ): Promise<AiDeepResearchInvestigationReport> => {
            if (investigationSignal.aborted) {
                throw new Error(
                    'Deep Research stopped before this investigation started',
                );
            }
            let report: AiDeepResearchInvestigationReport | null = null;
            try {
                await this.dependencies.aiAgentService.generateAgentThreadResponse(
                    user,
                    {
                        agentUuid: run.agent_uuid,
                        threadUuid: run.ai_thread_uuid,
                        promptUuid: run.prompt_uuid,
                        autoApproveSql: true,
                        execution: {
                            mode: 'deep_research',
                            runUuid: run.ai_deep_research_run_uuid,
                            phase: 'investigation',
                            maxSteps: workflow.investigatorSteps,
                            compactedEvidence: getInvestigationDirective({
                                workflow,
                                wave: (index % workflow.waves) + 1,
                                compactedEvidence,
                            }),
                            budget: phaseBudgets.investigator,
                            selectedMcpServerUuids:
                                run.selected_mcp_server_uuids,
                            abortSignal: investigationSignal,
                            initialTokenUsage: 0,
                            onStepUsage: trackTokens,
                            onWarehouseQuery: trackInvestigationWarehouseQuery,
                            ...(index === 0
                                ? {
                                      onExecutionContextResolved: (snapshot) =>
                                          this.dependencies.aiDeepResearchRunModel.updateExecutionContextSnapshot(
                                              run.ai_deep_research_run_uuid,
                                              snapshot,
                                          ),
                                  }
                                : {}),
                            research: {
                                role: 'investigator',
                                hypothesis,
                                onReport: (submitted) => {
                                    report = submitted;
                                },
                            },
                            parentToolCallId: `deep-research:${run.ai_deep_research_run_uuid}:${hypothesis.id}`,
                        },
                        onStepProgress:
                            makeStepProgressHandler('investigating'),
                    },
                );
            } catch (error) {
                if (!report) {
                    throw error;
                }
            }
            if (!report) {
                throw new Error(
                    'The investigation ended without submitting a report',
                );
            }
            return report;
        };

        const runJudge = async (
            investigations: AiDeepResearchInvestigation[],
            compactedEvidence: string,
        ) =>
            this.dependencies.aiAgentService.generateAgentThreadResponse(user, {
                agentUuid: run.agent_uuid,
                threadUuid: run.ai_thread_uuid,
                promptUuid: run.prompt_uuid,
                autoApproveSql: true,
                execution: {
                    mode: 'deep_research',
                    runUuid: run.ai_deep_research_run_uuid,
                    phase: 'synthesis',
                    maxSteps: 2,
                    compactedEvidence,
                    budget: phaseBudgets.judge,
                    selectedMcpServerUuids: [],
                    abortSignal: runSignal,
                    initialTokenUsage: tokens,
                    onStepUsage: trackTokens,
                    onWarehouseQuery: trackWarehouseQuery,
                    research: { role: 'judge', investigations },
                },
                onStepProgress: makeStepProgressHandler('synthesizing'),
            });

        let executionError: unknown = null;
        let investigations: AiDeepResearchInvestigation[] = [];
        try {
            let hypotheses: AiDeepResearchHypothesis[] | null = null;
            try {
                hypotheses = await runPlanner();
            } catch (error) {
                const explorationStopped = softLimitController.signal.aborted;
                if (!explorationStopped) {
                    throw error;
                }
            }

            const explorationStopped = softLimitController.signal.aborted;
            if (!hypotheses && !runSignal.aborted && !explorationStopped) {
                throw new Error(
                    'Deep Research could not produce competing hypotheses to investigate',
                );
            }

            if (hypotheses && !runSignal.aborted) {
                const plannerCheckpoint = getCompactedEvidence({
                    provenance: await this.getProvenance(run.prompt_uuid, {
                        includeSubagentToolCalls: true,
                    }),
                    waveConclusions: [],
                });
                // Deterministic fan-out: every investigator starts here, in
                // parallel — never at the model's discretion.
                const settled = await Promise.allSettled(
                    hypotheses.map((hypothesis, index) =>
                        runInvestigator(hypothesis, index, plannerCheckpoint),
                    ),
                );
                investigations = hypotheses.map((hypothesis, index) => {
                    const outcome = settled[index];
                    return outcome.status === 'fulfilled'
                        ? {
                              hypothesis,
                              report: outcome.value,
                              failureReason: null,
                          }
                        : {
                              hypothesis,
                              report: null,
                              failureReason: getErrorMessage(outcome.reason),
                          };
                });

                const completed = investigations.filter(
                    (investigation) => investigation.report !== null,
                );
                const investigationStopped = softLimitController.signal.aborted;
                if (
                    completed.length < 2 &&
                    !runSignal.aborted &&
                    !investigationStopped
                ) {
                    const failureSummary = investigations
                        .filter(
                            (investigation) =>
                                investigation.failureReason !== null,
                        )
                        .map(
                            (investigation) =>
                                `${investigation.hypothesis.id}: ${investigation.failureReason}`,
                        )
                        .join('; ');
                    throw new Error(
                        `Deep Research completed only ${completed.length} of ${hypotheses.length} hypothesis investigations, but comparing hypotheses requires at least two (${failureSummary})`,
                    );
                }
            }

            if (!runSignal.aborted) {
                const compactedEvidence = getCompactedEvidence({
                    provenance: await this.getProvenance(run.prompt_uuid, {
                        includeSubagentToolCalls: true,
                    }),
                    waveConclusions: investigations.flatMap((investigation) =>
                        investigation.report
                            ? [investigation.report.summary]
                            : [],
                    ),
                });
                await runJudge(investigations, compactedEvidence);
            }
        } catch (error) {
            executionError = error;
        } finally {
            clearTimeout(softLimitTimer);
            await stopRunMonitor();
        }

        if (authorizationRevokedReason) {
            return {
                status: 'failed',
                errorMessage: authorizationRevokedReason,
                terminalReason: 'permission_revoked',
            };
        }

        // Chart evidence (queryUuids) lives in investigator subagent child
        // rows; the report itself is the judge's top-level submission.
        const provenance = await this.getProvenance(run.prompt_uuid, {
            includeSubagentToolCalls: true,
        });
        const { report, warehouseQueryUuids: queryUuids } =
            getDeepResearchCheckpoint({ run, provenance });

        if (cancelledByUser) {
            if (report) {
                return {
                    status: 'partially_completed',
                    report,
                    warehouseQueryUuids: queryUuids,
                    terminalReason: 'user_cancellation',
                };
            }
            return {
                status: 'cancelled',
                terminalReason: 'user_cancellation',
            };
        }

        if (signal.aborted) {
            if (signal.reason?.name !== 'TimeoutError') {
                return {
                    status: 'cancelled',
                    terminalReason: 'internal_error',
                };
            }
            if (report) {
                return {
                    status: 'partially_completed',
                    report,
                    warehouseQueryUuids: queryUuids,
                    terminalReason: 'timeout',
                };
            }
            const timeoutCheckpoint = getDeepResearchCheckpoint({
                run,
                provenance,
                partialReason:
                    'The hard time limit was reached before report synthesis completed.',
            });
            if (timeoutCheckpoint.report) {
                return {
                    status: 'partially_completed',
                    report: timeoutCheckpoint.report,
                    warehouseQueryUuids: timeoutCheckpoint.warehouseQueryUuids,
                    terminalReason: 'timeout',
                };
            }
            return {
                status: 'failed',
                errorMessage: getErrorMessage(signal.reason),
                terminalReason: 'timeout',
            };
        }

        if (budgetExceeded) {
            return {
                status: 'partially_completed',
                report:
                    report ??
                    getPartialReport(
                        run,
                        `The ${budgetExceeded} budget was exhausted.`,
                    ),
                warehouseQueryUuids: queryUuids,
                terminalReason:
                    budgetExceeded === 'maxToolCalls'
                        ? 'tool_limit'
                        : 'query_limit',
            };
        }
        if (executionError) {
            if (report) {
                return {
                    status: 'partially_completed',
                    report,
                    warehouseQueryUuids: queryUuids,
                    terminalReason: 'provider_error',
                };
            }
            return {
                status: 'failed',
                errorMessage: getErrorMessage(executionError),
                terminalReason: 'provider_error',
            };
        }
        if (!report) {
            const hasInvalidReportSubmission = provenance.some(
                ({ toolCall }) =>
                    toolCall.toolName === AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
            );
            if (hasInvalidReportSubmission) {
                return {
                    status: 'partially_completed',
                    report: getEvidencePartialReport({
                        run,
                        provenance,
                        reason: 'The submitted report did not pass validation after its repair attempt.',
                    }),
                    warehouseQueryUuids: queryUuids,
                    terminalReason: 'provider_error',
                };
            }
            return {
                status: 'failed',
                errorMessage:
                    'Deep Research finished without submitting a report',
                terminalReason: 'provider_error',
            };
        }

        return {
            status: 'completed',
            report,
            warehouseQueryUuids: queryUuids,
            terminalReason: null,
        };
    };
}
