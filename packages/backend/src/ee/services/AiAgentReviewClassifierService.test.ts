import {
    FeatureFlags,
    ForbiddenError,
    ProjectType,
    type AiAgentReviewClassifierJudgeOutput,
    type AiAgentReviewClassifierTurnCandidate,
} from '@lightdash/common';
import { type FeatureFlagService } from '../../services/FeatureFlag/FeatureFlagService';
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

const makeProjectContextJudgeOutput = (): AiAgentReviewClassifierJudgeOutput =>
    makeJudgeOutput({
        signal: 'implicit_correction',
        implicitSignalSources: ['next_user_correction'],
        confidence: 'high',
        promotedToFinding: true,
        promotionReason: 'LLM judge found missing project context.',
        primaryRootCause: 'project_context',
        secondaryRootCauses: [],
        subcategories: ['wrong_explore_selection'],
        fixTargets: ['project_context_rule'],
        targetRefs: [
            {
                type: 'explore',
                label: 'orders',
                modelName: 'orders',
                fieldName: 'orders',
                setting: null,
                key: null,
            },
        ],
        ownerType: 'semantic_layer_owner',
        projectContextEntry: {
            op: 'create',
            id: null,
            kind: 'context',
            content: 'Use the orders explore for revenue questions.',
            terms: ['revenue'],
            objects: ['orders'],
        },
        reviewItem: {
            title: 'Review revenue routing',
            description: 'LLM judge grouped missing project context.',
        },
    });

describe('AiAgentReviewClassifierService', () => {
    const featureFlagService = {
        get: jest.fn(),
    } as unknown as jest.Mocked<FeatureFlagService>;

    const model = {
        listTurnReviewCandidates: jest.fn(),
        createRun: jest.fn(),
        updateRun: jest.fn(),
        createTurnSignal: jest.fn(),
        getThreadWritebackPullRequests: jest.fn().mockResolvedValue(new Map()),
    } as unknown as jest.Mocked<AiAgentReviewClassifierModel>;
    const aiAgentModel = {
        getAgent: jest.fn(),
    };
    const aiOrganizationSettingsModel = {
        findByOrganizationUuid: jest.fn(),
    } as unknown as jest.Mocked<AiOrganizationSettingsModel>;
    const catalogModel = {
        getCatalogItemsSummary: jest.fn(),
    };
    const projectModel = {
        getSummary: jest.fn(),
    };
    const aiAgentReviewNotificationService = {
        notifyNeedsReview: jest.fn(),
    };
    const judgeTurn = jest.fn();

    const service = new AiAgentReviewClassifierService({
        aiAgentReviewClassifierModel: model,
        aiAgentModel: aiAgentModel as never,
        aiOrganizationSettingsModel,
        catalogModel: catalogModel as never,
        projectModel: projectModel as never,
        featureFlagService,
        lightdashConfig: {} as never,
        judgeTurn,
        aiAgentReviewNotificationService:
            aiAgentReviewNotificationService as never,
    });

    beforeEach(() => {
        jest.resetAllMocks();
        featureFlagService.get.mockResolvedValue({
            id: FeatureFlags.AiWriteback,
            enabled: true,
        });
        aiOrganizationSettingsModel.findByOrganizationUuid.mockResolvedValue({
            organizationUuid: ORGANIZATION_UUID,
            aiAgentsVisible: true,
            aiAgentReviewsEnabled: true,
            mcpContentWritesEnabled: true,
        });
        model.createRun.mockResolvedValue(makeRun());
        model.updateRun.mockResolvedValue(makeRun({ status: 'completed' }));
        model.createTurnSignal.mockResolvedValue(SIGNAL_UUID);
        model.getThreadWritebackPullRequests.mockResolvedValue(new Map());
        aiAgentReviewNotificationService.notifyNeedsReview.mockResolvedValue(
            undefined,
        );
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

    it('drops project context entries when AI writeback is disabled', async () => {
        featureFlagService.get.mockImplementation(({ featureFlagId }) =>
            Promise.resolve({
                id: featureFlagId,
                enabled: false,
            }),
        );
        judgeTurn.mockResolvedValueOnce(makeProjectContextJudgeOutput());
        model.listTurnReviewCandidates.mockResolvedValue([
            makeCandidate({
                nextUserPrompt: 'No, use orders for revenue questions.',
            }),
        ]);

        const result = await service.run({
            organizationUuid: ORGANIZATION_UUID,
            startedAt: NOW,
            endedAt: NOW,
            persistFindings: true,
        });

        expect(result.findingCount).toBe(1);
        expect(model.createTurnSignal).toHaveBeenCalledWith(
            expect.objectContaining({
                finding: expect.objectContaining({
                    primaryRootCause: 'project_context',
                    projectContextEntry: null,
                }),
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
