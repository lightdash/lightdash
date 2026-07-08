import {
    type AiAgentReviewClassifierJudgeOutput,
    type AiAgentReviewClassifierTurnCandidate,
} from '@lightdash/common';
import { generateObject } from 'ai';
import { getModel } from './ai/models';
import {
    AiAgentReviewClassifierService,
    type AiAgentReviewJudgeReplayInput,
} from './AiAgentReviewClassifierService';

vi.mock('ai', () => ({ generateObject: vi.fn() }));
vi.mock('./ai/models', () => ({ getModel: vi.fn() }));
vi.mock('./ai/agents/agentV2', () => ({ defaultAgentOptions: {} }));
vi.mock('./ai/utils/aiCallTelemetry', () => ({
    // Valid shape so the real emitAiUsage doesn't throw internally when the
    // classifier emits usage (it reads telemetry.metadata).
    getAiCallTelemetry: () => ({ functionId: 'test', metadata: {} }),
    getLanguageModelAttribution: () => ({}),
}));

const generateObjectMock = vi.mocked(generateObject);
const getModelMock = vi.mocked(getModel);

const JUDGE_MODEL = {
    model: { modelId: 'claude-haiku-4-5' },
    callOptions: {},
    providerOptions: {},
};

const candidate = {
    subject: {
        type: 'turn_review',
        assistantPromptUuid: 'prompt-1',
        threadUuid: 'thread-1',
        agentUuid: 'agent-1',
        projectUuid: 'project-1',
        organizationUuid: 'org-1',
    },
    interactionSource: 'app',
    sourceRef: {
        source: 'app',
        threadUuid: 'thread-1',
        promptUuid: 'prompt-1',
        appUrl: null,
    },
    targetTurn: {
        promptUuid: 'prompt-1',
        userPrompt: 'question',
        assistantResponse: 'answer',
        errorMessage: null,
        createdAt: new Date('2026-06-01T10:00:00.000Z'),
        respondedAt: new Date('2026-06-01T10:00:05.000Z'),
    },
    contextTurns: [],
    userPrompt: 'question',
    assistantResponse: 'answer',
    errorMessage: null,
    humanScore: null,
    humanFeedback: null,
    createdAt: new Date('2026-06-01T10:00:00.000Z'),
    respondedAt: new Date('2026-06-01T10:00:05.000Z'),
    nextUserPromptUuid: null,
    nextUserPrompt: null,
    modelMetadata: { provider: 'anthropic', model: 'claude' },
    tokenUsageTotal: null,
    queryHistory: [],
    supportingEvidence: [],
    toolOutcomes: [],
    pendingApprovalTimeout: false,
} satisfies AiAgentReviewClassifierTurnCandidate;

const replayInput: AiAgentReviewJudgeReplayInput = {
    candidate,
    evidencePacket: {
        subject: candidate.subject,
        interactionSource: candidate.interactionSource,
        targetTurn: candidate.targetTurn,
        humanFeedback: { score: null, comment: null },
        agentConfig: {
            snapshotHash: null,
            settings: [],
            availableCapabilities: [],
            dataAccessEnabled: null,
            selfImprovementEnabled: null,
            contentToolsEnabled: null,
            instructionSummary: null,
            knowledgeDocumentCount: 0,
            knowledgeDocuments: [],
            mcpServers: [],
        },
        semanticContext: {
            queriedExploreNames: [],
            queriedFieldNames: [],
            catalogMatches: [],
        },
        nextUserPrompt: null,
        previousTurns: [],
        queryHistory: [],
        supportingEvidence: [],
        suggestedEvidenceExcerpts: [],
        threadWritebackPullRequests: [],
        toolOutcomes: [],
        pendingApprovalTimeout: false,
        existingReviewItems: [],
    },
};

const judgeOutput = (
    overrides: Partial<AiAgentReviewClassifierJudgeOutput> = {},
): AiAgentReviewClassifierJudgeOutput => ({
    signal: 'implicit_correction',
    implicitSignalSources: ['tool_error'],
    confidence: 'high',
    promotedToFinding: true,
    promotionReason: 'Tool errored.',
    primaryRootCause: 'runtime_reliability',
    secondaryRootCauses: [],
    subcategories: [],
    fixTargets: [],
    targetRefs: [],
    agentConfigurationSettings: [],
    ownerType: 'unknown',
    evidenceExcerpts: [],
    recommendation: null,
    projectContextEntry: null,
    matchedExistingItemKey: null,
    reviewItem: { title: 'Fix it', description: 'why' },
    ...overrides,
});

const makeService = () =>
    new AiAgentReviewClassifierService({
        aiAgentReviewClassifierModel: {} as never,
        aiAgentModel: {} as never,
        aiAgentDocumentModel: { findAllForAgent: vi.fn() },
        aiOrganizationSettingsModel: {} as never,
        catalogModel: { getCatalogItemsSummary: vi.fn() },
        projectModel: {
            getSummary: vi.fn(),
            findExploresFromCache: vi.fn(),
        } as never,
        lightdashConfig: {
            ai: { copilot: { providers: {}, defaultProvider: 'openai' } },
        } as never,
        aiAgentReviewNotificationService: {} as never,
    });

describe('single-tier judge', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getModelMock.mockReturnValue(JUDGE_MODEL as never);
    });

    it('judges with the fast model in a single call when not promoted', async () => {
        const output = judgeOutput({
            promotedToFinding: false,
            promotionReason: null,
            primaryRootCause: 'not_a_failure',
            signal: 'acceptance_or_continuation',
            implicitSignalSources: [],
        });
        generateObjectMock.mockResolvedValueOnce({ object: output } as never);

        const result = await makeService().replayJudge(replayInput);

        expect(generateObjectMock).toHaveBeenCalledTimes(1);
        expect(getModelMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ useFastModel: true }),
        );
        expect(generateObjectMock).toHaveBeenCalledWith(
            expect.objectContaining({ model: JUDGE_MODEL.model }),
        );
        expect(result.judgeOutput).toEqual(output);
    });

    it('judges promoted turns with the same single fast-model call', async () => {
        const output = judgeOutput();
        generateObjectMock.mockResolvedValueOnce({ object: output } as never);

        const result = await makeService().replayJudge(replayInput);

        expect(generateObjectMock).toHaveBeenCalledTimes(1);
        expect(result.judgeOutput).toEqual(output);
    });
});
