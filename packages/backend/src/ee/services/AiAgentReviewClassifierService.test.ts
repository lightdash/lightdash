import {
    ForbiddenError,
    ProjectType,
    type AiAgentReviewClassifierJudgeOutput,
    type AiAgentReviewClassifierTurnCandidate,
} from '@lightdash/common';
import { type AiAgentReviewClassifierModel } from '../models/AiAgentReviewClassifierModel';
import { type AiOrganizationSettingsModel } from '../models/AiOrganizationSettingsModel';
import {
    AiAgentReviewClassifierService,
    resolveReviewJudgeProvider,
} from './AiAgentReviewClassifierService';

const ORGANIZATION_UUID = '00000000-0000-0000-0000-000000000001';
const PROJECT_UUID = '00000000-0000-0000-0000-000000000002';
const AGENT_UUID = '00000000-0000-0000-0000-000000000003';
const RUN_UUID = '00000000-0000-0000-0000-000000000004';
const THREAD_UUID = '00000000-0000-0000-0000-000000000005';
const PROMPT_UUID = '00000000-0000-0000-0000-000000000006';
const SIGNAL_UUID = '00000000-0000-0000-0000-000000000007';
const NOW = new Date('2026-05-26T10:00:00.000Z');

const makeCandidate = (
    overrides: Partial<AiAgentReviewClassifierTurnCandidate> = {},
): AiAgentReviewClassifierTurnCandidate => ({
    subject: {
        type: 'turn_review',
        assistantPromptUuid: PROMPT_UUID,
        threadUuid: THREAD_UUID,
        agentUuid: AGENT_UUID,
        projectUuid: PROJECT_UUID,
        organizationUuid: ORGANIZATION_UUID,
    },
    interactionSource: 'app',
    sourceRef: {
        source: 'app',
        threadUuid: THREAD_UUID,
        promptUuid: PROMPT_UUID,
        appUrl: null,
    },
    targetTurn: {
        promptUuid: PROMPT_UUID,
        userPrompt: 'Show airport volume by country',
        assistantResponse: 'Country is not available.',
        errorMessage: null,
        createdAt: NOW,
        respondedAt: NOW,
    },
    contextTurns: [],
    userPrompt: 'Show airport volume by country',
    assistantResponse: 'Country is not available.',
    errorMessage: null,
    humanScore: null,
    humanFeedback: null,
    createdAt: NOW,
    respondedAt: NOW,
    nextUserPromptUuid: null,
    nextUserPrompt: null,
    modelMetadata: {
        provider: 'openai',
        model: 'gpt-5',
    },
    tokenUsageTotal: 123,
    queryHistory: [],
    supportingEvidence: [],
    toolOutcomes: [],
    pendingApprovalTimeout: false,
    ...overrides,
});

const makeWritebackEvidence = (
    resultPreview: string,
): AiAgentReviewClassifierTurnCandidate['supportingEvidence'][number] => ({
    source: 'tool_trace',
    toolCallId: 'writeback-tool-call-1',
    toolName: 'editDbtProject',
    parentToolCallId: null,
    createdAt: NOW,
    relevanceScore: 95,
    toolArgsPreview:
        '{"prompt":"Fix organization_events to use dbt ref syntax"}',
    resultPreview,
});

const makeRun = (overrides: Record<string, unknown> = {}) => ({
    uuid: RUN_UUID,
    organizationUuid: ORGANIZATION_UUID,
    status: 'running' as const,
    reviewAgentVersion: 'llm-judge-v1',
    judgePromptHash: 'ai-agent-review-judge-v2',
    agentConfigSnapshotHash: null,
    agentConfigSnapshot: null,
    agentConfigSnapshotAgentUpdatedAt: null,
    runScope: {
        type: 'backfill' as const,
        startedAt: '2026-05-26T00:00:00.000Z',
        endedAt: '2026-05-27T00:00:00.000Z',
    },
    totalTurns: 1,
    processedTurns: 0,
    signalCount: 0,
    findingCount: 0,
    reviewItemCount: 0,
    errorMessage: null,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
});

const makeJudgeOutput = (
    overrides: Partial<AiAgentReviewClassifierJudgeOutput> = {},
): AiAgentReviewClassifierJudgeOutput => ({
    signal: 'acceptance_or_continuation',
    implicitSignalSources: [],
    confidence: 'low',
    promotedToFinding: false,
    promotionReason: null,
    primaryRootCause: 'not_a_failure',
    secondaryRootCauses: [],
    subcategories: [],
    fixTargets: ['no_action'],
    targetRefs: [],
    agentConfigurationSettings: [],
    ownerType: 'unknown',
    evidenceExcerpts: [
        {
            source: 'user_prompt',
            text: 'Show airport volume by country',
            redacted: false,
        },
    ],
    recommendation: null,
    projectContextEntry: null,
    matchedExistingItemKey: null,
    reviewItem: {
        title: 'No review needed',
        description: 'Judge found no actionable issue.',
    },
    ...overrides,
});

const makeSemanticJudgeOutput = (): AiAgentReviewClassifierJudgeOutput =>
    makeJudgeOutput({
        signal: 'implicit_correction',
        implicitSignalSources: ['next_user_correction'],
        confidence: 'high',
        promotedToFinding: true,
        promotionReason: 'LLM judge found a semantic-layer correction.',
        primaryRootCause: 'semantic_layer',
        secondaryRootCauses: ['project_context'],
        subcategories: ['missing_dimension'],
        fixTargets: ['semantic_yaml_patch'],
        targetRefs: [
            {
                type: 'dimension',
                label: 'airports.country',
                modelName: 'airports',
                fieldName: 'country',
                setting: null,
                key: null,
            },
        ],
        ownerType: 'semantic_layer_owner',
        evidenceExcerpts: [
            {
                source: 'next_user_prompt',
                text: 'No, country is not available here, so use airport name.',
                redacted: false,
            },
        ],
        recommendation: {
            actionType: 'update_semantic_yaml',
            title: 'Review semantic layer definition',
            rationale:
                'The correction points to a model, field, metric, or join context issue.',
            targetRefs: [
                {
                    type: 'dimension',
                    label: 'airports.country',
                    modelName: 'airports',
                    fieldName: 'country',
                    setting: null,
                    key: null,
                },
            ],
        },
        reviewItem: {
            title: 'Review airports.country',
            description: 'LLM judge grouped a semantic-layer correction.',
        },
    });

const makeProductJudgeOutput = (): AiAgentReviewClassifierJudgeOutput =>
    makeJudgeOutput({
        signal: 'product_capability_request',
        implicitSignalSources: ['product_capability_request'],
        confidence: 'medium',
        promotedToFinding: true,
        promotionReason: 'LLM judge found a product capability request.',
        primaryRootCause: 'product_capability',
        secondaryRootCauses: [],
        subcategories: ['capability_request'],
        fixTargets: ['product_capability_ticket'],
        targetRefs: [
            {
                type: 'product_capability',
                label: 'AI agent capability request',
                modelName: null,
                fieldName: null,
                setting: null,
                key: 'ai_agent_capability_request',
            },
        ],
        ownerType: 'product',
        evidenceExcerpts: [
            {
                source: 'next_user_prompt',
                text: 'I wish the product should support exporting this analysis to slides.',
                redacted: false,
            },
        ],
        recommendation: {
            actionType: 'route_to_product_work',
            title: 'Review product capability request',
            rationale:
                'This may require product work rather than semantic-layer or agent-admin changes.',
            targetRefs: [
                {
                    type: 'product_capability',
                    label: 'AI agent capability request',
                    modelName: null,
                    fieldName: null,
                    setting: null,
                    key: 'ai_agent_capability_request',
                },
            ],
        },
        reviewItem: {
            title: 'Review AI agent product limitation',
            description: 'LLM judge found a product capability limitation.',
        },
    });

describe('AiAgentReviewClassifierService', () => {
    const model = {
        listTurnReviewCandidates: vi.fn(),
        createRun: vi.fn(),
        updateRun: vi.fn(),
        createTurnSignal: vi.fn(),
        getThreadWritebackPullRequests: vi.fn().mockResolvedValue(new Map()),
        getAgentMcpCapabilities: vi.fn().mockResolvedValue([]),
        findReviewItemDedupCandidates: vi.fn().mockResolvedValue([]),
    } as unknown as import('vitest').Mocked<AiAgentReviewClassifierModel>;
    const aiAgentModel = {
        getAgent: vi.fn(),
    };
    const aiAgentDocumentModel = {
        findAllForAgent: vi.fn().mockResolvedValue([]),
    };
    const aiOrganizationSettingsModel = {
        findByOrganizationUuid: vi.fn(),
    } as unknown as import('vitest').Mocked<AiOrganizationSettingsModel>;
    const orgAiCopilotConfigResolver = {
        getReviewJudgeAvailability: vi.fn(),
    };
    const catalogModel = {
        getCatalogItemsSummary: vi.fn(),
    };
    const projectModel = {
        getSummary: vi.fn(),
        findExploresFromCache: vi.fn(),
    };
    const aiAgentReviewNotificationService = {
        notifyNeedsReview: vi.fn(),
    };
    const judgeTurn = vi.fn();

    const service = new AiAgentReviewClassifierService({
        aiAgentReviewClassifierModel: model,
        aiAgentModel: aiAgentModel as never,
        aiAgentDocumentModel,
        aiOrganizationSettingsModel,
        orgAiCopilotConfigResolver: orgAiCopilotConfigResolver as never,
        catalogModel: catalogModel as never,
        projectModel: projectModel as never,
        lightdashConfig: {} as never,
        judgeTurn,
        aiAgentReviewNotificationService:
            aiAgentReviewNotificationService as never,
    });

    beforeEach(() => {
        vi.resetAllMocks();
        orgAiCopilotConfigResolver.getReviewJudgeAvailability.mockResolvedValue(
            {
                hasActiveByoKey: false,
                canJudgeOnByoKey: false,
            },
        );
        aiOrganizationSettingsModel.findByOrganizationUuid.mockResolvedValue({
            organizationUuid: ORGANIZATION_UUID,
            aiAgentsVisible: true,
            aiAgentReviewsEnabled: true,
            mcpContentWritesEnabled: true,
            defaultAiAgentModelConfig: null,
            modelVisibility: null,
            providerApiKeysSet: { anthropic: false, openai: false },
            providerApiKeyHints: { anthropic: null, openai: null },
        });
        model.createRun.mockResolvedValue(makeRun());
        model.updateRun.mockResolvedValue(makeRun({ status: 'completed' }));
        model.createTurnSignal.mockResolvedValue({
            turnSignalUuid: SIGNAL_UUID,
            reviewItemOutcome: 'created',
        });
        model.findReviewItemDedupCandidates.mockResolvedValue([]);
        model.getThreadWritebackPullRequests.mockResolvedValue(new Map());
        aiAgentReviewNotificationService.notifyNeedsReview.mockResolvedValue(
            undefined,
        );
        aiAgentDocumentModel.findAllForAgent.mockResolvedValue([]);
        model.getAgentMcpCapabilities.mockResolvedValue([]);
        aiAgentModel.getAgent.mockResolvedValue({
            uuid: AGENT_UUID,
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
            name: 'Jaffle Shop',
            description: null,
            tags: [],
            integrations: [],
            updatedAt: NOW,
            createdAt: NOW,
            instruction: 'Use semantic metrics before raw fields.',
            imageUrl: null,
            enableDataAccess: true,
            enableSelfImprovement: false,
            enableContentTools: false,
            version: 'v1',
            groupAccess: [],
            userAccess: [],
            spaceAccess: [],
        });
        projectModel.getSummary.mockResolvedValue({
            name: 'Jaffle Shop',
            projectUuid: PROJECT_UUID,
            organizationUuid: ORGANIZATION_UUID,
            type: ProjectType.DEFAULT,
            upstreamProjectUuid: null,
        });
        catalogModel.getCatalogItemsSummary.mockResolvedValue([
            {
                catalogSearchUuid: 'catalog-1',
                cachedExploreUuid: 'explore-1',
                projectUuid: PROJECT_UUID,
                name: 'payments_total_revenue',
                label: 'Total revenue',
                description: 'Total payment amount.',
                type: 'field',
                tableName: 'payments',
                fieldType: 'metric',
            },
        ]);
        judgeTurn.mockResolvedValue(makeJudgeOutput());
    });

    it('throws when review collection is not opted in for the organization', async () => {
        aiOrganizationSettingsModel.findByOrganizationUuid.mockResolvedValueOnce(
            {
                organizationUuid: ORGANIZATION_UUID,
                aiAgentsVisible: true,
                aiAgentReviewsEnabled: false,
                mcpContentWritesEnabled: true,
                defaultAiAgentModelConfig: null,
                modelVisibility: null,
                providerApiKeysSet: { anthropic: false, openai: false },
                providerApiKeyHints: { anthropic: null, openai: null },
            },
        );

        await expect(
            service.run({
                organizationUuid: ORGANIZATION_UUID,
                startedAt: NOW,
                endedAt: NOW,
            }),
        ).rejects.toThrow(ForbiddenError);

        expect(model.createRun).not.toHaveBeenCalled();
    });

    it('persists one signal per candidate and completes the run', async () => {
        model.listTurnReviewCandidates.mockResolvedValue([
            makeCandidate(),
            makeCandidate({
                subject: {
                    ...makeCandidate().subject,
                    assistantPromptUuid: '00000000-0000-0000-0000-000000000010',
                },
            }),
        ]);

        const result = await service.run({
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
            agentUuid: AGENT_UUID,
            startedAt: NOW,
            endedAt: NOW,
        });

        expect(result).toEqual(
            expect.objectContaining({
                runUuid: RUN_UUID,
                processedTurns: 2,
                signalCount: 2,
                findingCount: 0,
                reviewItemCount: 0,
            }),
        );
        expect(model.createTurnSignal).toHaveBeenCalledTimes(2);
        expect(model.updateRun).toHaveBeenCalledWith(
            expect.objectContaining({
                runUuid: RUN_UUID,
                status: 'completed',
                processedTurns: 2,
                signalCount: 2,
            }),
        );
    });

    it('stores actionable findings inline on persisted signals', async () => {
        judgeTurn.mockResolvedValueOnce(makeSemanticJudgeOutput());
        model.listTurnReviewCandidates.mockResolvedValue([
            makeCandidate({
                nextUserPrompt:
                    'No, country is not available here, so use airport name.',
            }),
        ]);

        const result = await service.run({
            organizationUuid: ORGANIZATION_UUID,
            startedAt: NOW,
            endedAt: NOW,
            persistFindings: true,
            promoteFindingsToReviewItems: true,
        });

        expect(result.findingCount).toBe(1);
        expect(result.reviewItemCount).toBe(1);
        expect(model.createTurnSignal).toHaveBeenCalledWith(
            expect.objectContaining({
                runUuid: RUN_UUID,
                finding: expect.objectContaining({
                    primaryRootCause: 'semantic_layer',
                    secondaryRootCauses: ['project_context'],
                    reviewItem: expect.objectContaining({
                        fingerprint: expect.stringContaining(
                            'ai_agent_review_item:',
                        ),
                    }),
                }),
            }),
        );
        expect(
            aiAgentReviewNotificationService.notifyNeedsReview,
        ).toHaveBeenCalledWith({
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
            reviewRunUuid: RUN_UUID,
            fingerprints: [expect.stringContaining('ai_agent_review_item:')],
        });
    });

    it('does not promote turns where writeback already opened a pull request', async () => {
        judgeTurn.mockResolvedValueOnce(makeSemanticJudgeOutput());
        model.listTurnReviewCandidates.mockResolvedValue([
            makeCandidate({
                supportingEvidence: [
                    makeWritebackEvidence(
                        'Opened a pull request against Lightdash project "Jaffle shop" (repository lightdash/dbt). A "View pull request" button is shown to the user.',
                    ),
                ],
                nextUserPrompt:
                    'Can you also check the organization_events model?',
            }),
        ]);

        const result = await service.run({
            organizationUuid: ORGANIZATION_UUID,
            startedAt: NOW,
            endedAt: NOW,
            persistFindings: true,
            promoteFindingsToReviewItems: true,
        });

        expect(judgeTurn).not.toHaveBeenCalled();
        expect(result.findingCount).toBe(0);
        expect(result.reviewItemCount).toBe(0);
        expect(model.createTurnSignal).toHaveBeenCalledWith(
            expect.objectContaining({
                runUuid: RUN_UUID,
                finding: null,
                turnSignal: expect.objectContaining({
                    signal: 'acceptance_or_continuation',
                    promotedToFinding: false,
                    promotionReason: 'writeback_tool_already_started',
                    toolEvidenceRefs: ['writeback-tool-call-1'],
                }),
            }),
        );
    });

    it('still judges writeback turns when no pull request was opened', async () => {
        judgeTurn.mockResolvedValueOnce(makeSemanticJudgeOutput());
        model.listTurnReviewCandidates.mockResolvedValue([
            makeCandidate({
                supportingEvidence: [
                    makeWritebackEvidence(
                        'The writeback agent ran against Lightdash project "Jaffle shop" but made no file changes, so no pull request was opened.',
                    ),
                ],
                nextUserPrompt:
                    'This still needs fixing in organization_events.',
            }),
        ]);

        const result = await service.run({
            organizationUuid: ORGANIZATION_UUID,
            startedAt: NOW,
            endedAt: NOW,
            persistFindings: true,
            promoteFindingsToReviewItems: true,
        });

        expect(judgeTurn).toHaveBeenCalledTimes(1);
        expect(result.findingCount).toBe(1);
        expect(result.reviewItemCount).toBe(1);
    });

    it('passes tool outcomes and the approval-timeout flag through to the judge packet', async () => {
        judgeTurn.mockResolvedValueOnce(makeJudgeOutput());
        model.listTurnReviewCandidates.mockResolvedValue([
            makeCandidate({
                toolOutcomes: [
                    {
                        toolCallId: 'content-tool-call-1',
                        toolName: 'editContent',
                        status: 'success',
                    },
                ],
                pendingApprovalTimeout: true,
            }),
        ]);

        await service.run({
            organizationUuid: ORGANIZATION_UUID,
            startedAt: NOW,
            endedAt: NOW,
        });

        expect(judgeTurn).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                toolOutcomes: [
                    {
                        toolCallId: 'content-tool-call-1',
                        toolName: 'editContent',
                        status: 'success',
                    },
                ],
                pendingApprovalTimeout: true,
            }),
        );
    });

    it('surfaces MCP servers and content tools as agent capabilities in the judge packet', async () => {
        judgeTurn.mockResolvedValueOnce(makeJudgeOutput());
        model.getAgentMcpCapabilities.mockResolvedValue([
            { name: 'Linear', enabledToolNames: ['list_issues'] },
        ]);
        model.listTurnReviewCandidates.mockResolvedValue([makeCandidate()]);

        await service.run({
            organizationUuid: ORGANIZATION_UUID,
            startedAt: NOW,
            endedAt: NOW,
        });

        expect(judgeTurn).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                agentConfig: expect.objectContaining({
                    availableCapabilities: expect.arrayContaining([
                        'mcp_tools',
                    ]),
                    mcpServers: [
                        { name: 'Linear', enabledToolNames: ['list_issues'] },
                    ],
                    settings: expect.arrayContaining(['mcp_servers']),
                }),
            }),
        );
    });

    it('scopes the catalog to the agent explore tags before matching', async () => {
        judgeTurn.mockResolvedValueOnce(makeJudgeOutput());
        aiAgentModel.getAgent.mockResolvedValue({
            uuid: AGENT_UUID,
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
            name: 'Jaffle Shop',
            description: null,
            tags: ['sales'],
            integrations: [],
            updatedAt: NOW,
            createdAt: NOW,
            instruction: null,
            imageUrl: null,
            enableDataAccess: true,
            enableSelfImprovement: false,
            enableContentTools: false,
            version: 'v1',
            groupAccess: [],
            userAccess: [],
            spaceAccess: [],
        });
        catalogModel.getCatalogItemsSummary.mockResolvedValue([
            {
                catalogSearchUuid: 'catalog-1',
                cachedExploreUuid: 'explore-1',
                projectUuid: PROJECT_UUID,
                name: 'flightcount',
                type: 'field',
                label: 'Flight count',
                description: null,
                tableName: 'orders',
                fieldType: 'metric',
            },
            {
                catalogSearchUuid: 'catalog-2',
                cachedExploreUuid: 'explore-2',
                projectUuid: PROJECT_UUID,
                name: 'flightcount',
                type: 'field',
                label: 'Flight count (staff)',
                description: null,
                tableName: 'staff',
                fieldType: 'metric',
            },
        ]);
        projectModel.findExploresFromCache.mockResolvedValue({
            orders: {
                name: 'orders',
                tags: ['sales'],
                baseTable: 'orders',
                tables: {
                    orders: {
                        dimensions: {},
                        metrics: { flightcount: {} },
                    },
                },
            },
            staff: {
                name: 'staff',
                tags: [],
                baseTable: 'staff',
                tables: {
                    staff: {
                        dimensions: {},
                        metrics: { flightcount: {} },
                    },
                },
            },
        });
        model.listTurnReviewCandidates.mockResolvedValue([
            makeCandidate({ userPrompt: 'what is the flightcount?' }),
        ]);

        await service.run({
            organizationUuid: ORGANIZATION_UUID,
            startedAt: NOW,
            endedAt: NOW,
        });

        const evidencePacket = judgeTurn.mock.calls[0][1];
        expect(evidencePacket.semanticContext.catalogMatches).toHaveLength(1);
        expect(evidencePacket.semanticContext.catalogMatches[0]).toEqual(
            expect.objectContaining({
                name: 'flightcount',
                tableName: 'orders',
            }),
        );
    });

    it('dry-runs without persisting signals or findings by default', async () => {
        judgeTurn.mockResolvedValueOnce(makeSemanticJudgeOutput());
        model.listTurnReviewCandidates.mockResolvedValue([
            makeCandidate({
                nextUserPrompt:
                    'No, country is not available here, so use airport name.',
            }),
        ]);

        const result = await service.run({
            organizationUuid: ORGANIZATION_UUID,
            startedAt: NOW,
            endedAt: NOW,
            dryRun: true,
            persistFindings: true,
            promoteFindingsToReviewItems: true,
        });

        expect(result.findingCount).toBe(1);
        expect(result.reviewItemCount).toBe(0);
        expect(result.report.dryRun).toBe(true);
        expect(result.report.findingsByRootCause.semantic_layer).toBe(1);
        expect(model.createTurnSignal).not.toHaveBeenCalled();
    });

    it('reviews the target turn and re-reviews the preceding turn on response_saved', async () => {
        judgeTurn.mockResolvedValue(makeSemanticJudgeOutput());
        model.listTurnReviewCandidates.mockResolvedValue([
            makeCandidate({
                userPrompt:
                    'No, country is not available here, so use airport name.',
                nextUserPromptUuid: '00000000-0000-0000-0000-000000000013',
                nextUserPrompt: 'Thanks, airport name works.',
                contextTurns: [
                    {
                        relation: 'previous',
                        promptUuid: '00000000-0000-0000-0000-000000000012',
                        userPrompt: 'Show airport volume by country',
                        assistantResponse:
                            'Airport country is scheduled origin country.',
                        errorMessage: null,
                        createdAt: NOW,
                        respondedAt: NOW,
                    },
                ],
            }),
        ]);

        const result = await service.runLiveEvent({
            eventType: 'response_saved',
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
            agentUuid: AGENT_UUID,
            threadUuid: THREAD_UUID,
            promptUuid: PROMPT_UUID,
        });

        // The target turn plus its immediate predecessor (now that the target
        // is the predecessor's real next-user-prompt / correction).
        expect(result?.processedTurns).toBe(2);
        expect(model.listTurnReviewCandidates).toHaveBeenCalledWith({
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
            agentUuid: AGENT_UUID,
            threadUuid: THREAD_UUID,
            promptUuid: PROMPT_UUID,
            limit: 1,
        });
        // ...and the preceding turn is pulled in for re-review.
        expect(model.listTurnReviewCandidates).toHaveBeenCalledWith({
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
            agentUuid: AGENT_UUID,
            threadUuid: THREAD_UUID,
            promptUuid: '00000000-0000-0000-0000-000000000012',
            limit: 1,
        });
        expect(model.createRun).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationUuid: ORGANIZATION_UUID,
                runScope: expect.objectContaining({
                    type: 'live_event',
                    eventType: 'response_saved',
                    promptUuid: PROMPT_UUID,
                    threadUuid: THREAD_UUID,
                }),
                totalTurns: 2,
            }),
        );
        expect(model.createTurnSignal).toHaveBeenCalledWith(
            expect.objectContaining({
                finding: expect.objectContaining({
                    primaryRootCause: 'semantic_layer',
                }),
            }),
        );
    });

    it('skips live review for preview projects', async () => {
        projectModel.getSummary.mockResolvedValue({
            name: 'Preview: fix-branch',
            projectUuid: PROJECT_UUID,
            organizationUuid: ORGANIZATION_UUID,
            type: ProjectType.PREVIEW,
            upstreamProjectUuid: PROJECT_UUID,
        });

        const result = await service.runLiveEvent({
            eventType: 'response_saved',
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
            agentUuid: AGENT_UUID,
            threadUuid: THREAD_UUID,
            promptUuid: PROMPT_UUID,
        });

        expect(result).toBeNull();
        expect(model.listTurnReviewCandidates).not.toHaveBeenCalled();
        expect(model.createRun).not.toHaveBeenCalled();
    });

    it('reviews only the target turn when it has no predecessor (first turn)', async () => {
        judgeTurn.mockResolvedValue(makeSemanticJudgeOutput());
        model.listTurnReviewCandidates.mockResolvedValue([
            makeCandidate({ contextTurns: [] }),
        ]);

        const result = await service.runLiveEvent({
            eventType: 'response_saved',
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
            agentUuid: AGENT_UUID,
            threadUuid: THREAD_UUID,
            promptUuid: PROMPT_UUID,
        });

        expect(result?.processedTurns).toBe(1);
        expect(model.listTurnReviewCandidates).toHaveBeenCalledTimes(1);
    });

    it('stores product capability findings as grouped review projections', async () => {
        judgeTurn.mockResolvedValueOnce(makeProductJudgeOutput());
        model.listTurnReviewCandidates.mockResolvedValue([
            makeCandidate({
                nextUserPrompt:
                    'I wish the product should support exporting this analysis to slides.',
            }),
        ]);

        const result = await service.run({
            organizationUuid: ORGANIZATION_UUID,
            startedAt: NOW,
            endedAt: NOW,
            persistFindings: true,
            promoteFindingsToReviewItems: true,
        });

        expect(result.findingCount).toBe(1);
        expect(result.reviewItemCount).toBe(1);
        expect(model.createTurnSignal).toHaveBeenCalledWith(
            expect.objectContaining({
                finding: expect.objectContaining({
                    primaryRootCause: 'product_capability',
                }),
            }),
        );
    });

    it('passes existing review items to the judge as dedup candidates', async () => {
        model.findReviewItemDedupCandidates.mockResolvedValue([
            {
                fingerprint: 'ai_agent_review_item:existing-1',
                title: 'Country not available',
                status: 'open',
                dismissedReason: null,
                primaryRootCause: 'semantic_layer',
                targetRefs: [
                    {
                        type: 'dimension',
                        modelName: 'airports',
                        dimensionName: 'country',
                    },
                ],
            },
        ]);
        model.listTurnReviewCandidates.mockResolvedValue([makeCandidate()]);

        await service.run({
            organizationUuid: ORGANIZATION_UUID,
            startedAt: NOW,
            endedAt: NOW,
        });

        const packet = judgeTurn.mock.calls[0][1];
        expect(packet.existingReviewItems).toEqual([
            {
                key: 'item_1',
                title: 'Country not available',
                status: 'open',
                dismissedReason: null,
                primaryRootCause: 'semantic_layer',
                objectSummary: 'country',
            },
        ]);
    });

    it('falls back to defaults for untitled or unclassified dedup candidates', async () => {
        model.findReviewItemDedupCandidates.mockResolvedValue([
            {
                fingerprint: 'ai_agent_review_item:existing-1',
                title: null,
                status: 'triage',
                dismissedReason: null,
                primaryRootCause: null,
                targetRefs: null,
            },
        ]);
        model.listTurnReviewCandidates.mockResolvedValue([makeCandidate()]);

        await service.run({
            organizationUuid: ORGANIZATION_UUID,
            startedAt: NOW,
            endedAt: NOW,
        });

        const packet = judgeTurn.mock.calls[0][1];
        expect(packet.existingReviewItems[0]).toEqual({
            key: 'item_1',
            title: 'Untitled review item',
            status: 'triage',
            dismissedReason: null,
            primaryRootCause: 'ambiguous',
            objectSummary: null,
        });
    });

    it('degrades to no dedup candidates when the query fails', async () => {
        model.findReviewItemDedupCandidates.mockRejectedValue(
            new Error('db down'),
        );
        model.listTurnReviewCandidates.mockResolvedValue([makeCandidate()]);

        const result = await service.run({
            organizationUuid: ORGANIZATION_UUID,
            startedAt: NOW,
            endedAt: NOW,
        });

        expect(result.processedTurns).toBe(1);
        expect(judgeTurn.mock.calls[0][1].existingReviewItems).toEqual([]);
    });

    it('reuses an existing item fingerprint when the judge matches a candidate', async () => {
        model.findReviewItemDedupCandidates.mockResolvedValue([
            {
                fingerprint: 'ai_agent_review_item:existing-1',
                title: 'Country not available',
                status: 'open',
                dismissedReason: null,
                primaryRootCause: 'semantic_layer',
                targetRefs: null,
            },
        ]);
        model.createTurnSignal.mockResolvedValue({
            turnSignalUuid: SIGNAL_UUID,
            reviewItemOutcome: 'recurred',
        });
        judgeTurn.mockResolvedValueOnce({
            ...makeSemanticJudgeOutput(),
            matchedExistingItemKey: 'item_1',
        });
        model.listTurnReviewCandidates.mockResolvedValue([
            makeCandidate({
                nextUserPrompt:
                    'No, country is not available here, so use airport name.',
            }),
        ]);

        const result = await service.run({
            organizationUuid: ORGANIZATION_UUID,
            startedAt: NOW,
            endedAt: NOW,
            persistFindings: true,
            promoteFindingsToReviewItems: true,
        });

        expect(model.createTurnSignal).toHaveBeenCalledWith(
            expect.objectContaining({
                finding: expect.objectContaining({
                    reviewItem: expect.objectContaining({
                        fingerprint: 'ai_agent_review_item:existing-1',
                    }),
                }),
            }),
        );
        // A recurrence accrues onto the existing card without re-notifying.
        expect(result.reviewItemCount).toBe(1);
        expect(
            aiAgentReviewNotificationService.notifyNeedsReview,
        ).not.toHaveBeenCalled();
    });

    it('computes a fresh fingerprint when the matched key is not a candidate', async () => {
        model.findReviewItemDedupCandidates.mockResolvedValue([]);
        judgeTurn.mockResolvedValueOnce({
            ...makeSemanticJudgeOutput(),
            matchedExistingItemKey: 'item_99',
        });
        model.listTurnReviewCandidates.mockResolvedValue([
            makeCandidate({
                nextUserPrompt:
                    'No, country is not available here, so use airport name.',
            }),
        ]);

        await service.run({
            organizationUuid: ORGANIZATION_UUID,
            startedAt: NOW,
            endedAt: NOW,
            persistFindings: true,
            promoteFindingsToReviewItems: true,
        });

        const [{ finding }] = model.createTurnSignal.mock.calls[0];
        expect(finding?.reviewItem.fingerprint).toContain(
            'ai_agent_review_item:',
        );
        expect(finding?.reviewItem.fingerprint).not.toBe(
            'ai_agent_review_item:existing-1',
        );
    });
});

describe('resolveReviewJudgeProvider', () => {
    const copilotWith = (
        providers: Record<string, unknown>,
    ): Parameters<typeof resolveReviewJudgeProvider>[0] =>
        ({ defaultProvider: 'openai', providers }) as never;

    it('prefers anthropic for the judge when it is configured', () => {
        expect(
            resolveReviewJudgeProvider(
                copilotWith({ openai: {}, anthropic: { apiKey: 'x' } }),
            ),
        ).toBe('anthropic');
    });

    it('falls back to the default provider when anthropic is absent', () => {
        expect(resolveReviewJudgeProvider(copilotWith({ openai: {} }))).toBe(
            undefined,
        );
    });
});

describe('enforceNextUserSignalGrounding', () => {
    const promotedWithNextUserSignal = (
        overrides: Partial<AiAgentReviewClassifierJudgeOutput> = {},
    ): AiAgentReviewClassifierJudgeOutput =>
        makeJudgeOutput({
            signal: 'implicit_correction',
            implicitSignalSources: ['next_user_correction'],
            promotedToFinding: true,
            promotionReason: 'User corrected the metric.',
            primaryRootCause: 'semantic_layer',
            ...overrides,
        });

    it('returns the output untouched when a next user prompt exists', () => {
        const output = promotedWithNextUserSignal();
        expect(
            AiAgentReviewClassifierService.enforceNextUserSignalGrounding(
                output,
                { hasNextUserPrompt: true, hasHumanFeedback: false },
            ),
        ).toBe(output);
    });

    it('returns the output untouched when no next_user_* sources were emitted', () => {
        const output = promotedWithNextUserSignal({
            implicitSignalSources: ['tool_error'],
        });
        expect(
            AiAgentReviewClassifierService.enforceNextUserSignalGrounding(
                output,
                { hasNextUserPrompt: false, hasHumanFeedback: false },
            ),
        ).toBe(output);
    });

    it('strips fabricated next_user_* sources and demotes when nothing else supports promotion', () => {
        const result =
            AiAgentReviewClassifierService.enforceNextUserSignalGrounding(
                promotedWithNextUserSignal({
                    implicitSignalSources: [
                        'next_user_correction',
                        'next_user_retry',
                    ],
                }),
                { hasNextUserPrompt: false, hasHumanFeedback: false },
            );
        expect(result.implicitSignalSources).toEqual([]);
        expect(result.promotedToFinding).toBe(false);
        expect(result.promotionReason).toBe(
            'next_user_signal_without_next_user_prompt',
        );
    });

    it('strips fabricated sources but keeps the promotion when other promotable evidence remains', () => {
        const result =
            AiAgentReviewClassifierService.enforceNextUserSignalGrounding(
                promotedWithNextUserSignal({
                    implicitSignalSources: [
                        'next_user_correction',
                        'tool_error',
                    ],
                }),
                { hasNextUserPrompt: false, hasHumanFeedback: false },
            );
        expect(result.implicitSignalSources).toEqual(['tool_error']);
        expect(result.promotedToFinding).toBe(true);
    });

    it('strips output_shape_correction as next-turn-derived and demotes', () => {
        const result =
            AiAgentReviewClassifierService.enforceNextUserSignalGrounding(
                promotedWithNextUserSignal({
                    implicitSignalSources: [
                        'next_user_retry',
                        'output_shape_correction',
                    ],
                }),
                { hasNextUserPrompt: false, hasHumanFeedback: false },
            );
        expect(result.implicitSignalSources).toEqual([]);
        expect(result.promotedToFinding).toBe(false);
    });

    it('keeps the promotion when explicit human feedback grounds it', () => {
        const result =
            AiAgentReviewClassifierService.enforceNextUserSignalGrounding(
                promotedWithNextUserSignal(),
                { hasNextUserPrompt: false, hasHumanFeedback: true },
            );
        expect(result.implicitSignalSources).toEqual([]);
        expect(result.promotedToFinding).toBe(true);
    });

    it('demotes a promotion built only on fabricated output_shape_correction', () => {
        const result =
            AiAgentReviewClassifierService.enforceNextUserSignalGrounding(
                promotedWithNextUserSignal({
                    implicitSignalSources: ['output_shape_correction'],
                }),
                { hasNextUserPrompt: false, hasHumanFeedback: false },
            );
        expect(result.promotedToFinding).toBe(false);
    });

    it('strips without demoting when the output was not promoted', () => {
        const result =
            AiAgentReviewClassifierService.enforceNextUserSignalGrounding(
                promotedWithNextUserSignal({
                    promotedToFinding: false,
                    promotionReason: null,
                }),
                { hasNextUserPrompt: false, hasHumanFeedback: false },
            );
        expect(result.implicitSignalSources).toEqual([]);
        expect(result.promotedToFinding).toBe(false);
        expect(result.promotionReason).toBeNull();
    });
});
