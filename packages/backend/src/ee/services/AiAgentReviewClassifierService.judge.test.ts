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
    getAiCallTelemetry: () => ({}),
}));

const generateObjectMock = vi.mocked(generateObject);
const getModelMock = vi.mocked(getModel);

const GATE_MODEL = {
    model: { modelId: 'claude-haiku-4-5' },
    callOptions: {},
    providerOptions: {},
};
const ESCALATION_MODEL = {
    model: { modelId: 'claude-sonnet-4-6' },
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
        featureFlagService: {} as never,
        lightdashConfig: {
            ai: { copilot: { providers: {}, defaultProvider: 'openai' } },
        } as never,
        aiAgentReviewNotificationService: {} as never,
    });

describe('two-tier judge escalation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getModelMock.mockImplementation(
            (_config, options) =>
                (options?.useFastModel
                    ? GATE_MODEL
                    : ESCALATION_MODEL) as never,
        );
    });

    it('returns the gate output without escalating when not promoted', async () => {
        const gateOutput = judgeOutput({
            promotedToFinding: false,
            promotionReason: null,
            primaryRootCause: 'not_a_failure',
            signal: 'acceptance_or_continuation',
            implicitSignalSources: [],
        });
        generateObjectMock.mockResolvedValueOnce({
            object: gateOutput,
        } as never);

        const result = await makeService().replayJudge(replayInput);

        expect(generateObjectMock).toHaveBeenCalledTimes(1);
        expect(generateObjectMock).toHaveBeenCalledWith(
            expect.objectContaining({ model: GATE_MODEL.model }),
        );
        expect(result.judgeOutput).toEqual(gateOutput);
    });

    it('escalates promoted turns to the strong model and returns its verdict', async () => {
        const escalatedOutput = judgeOutput({
            primaryRootCause: 'agent_configuration',
        });
        generateObjectMock
            .mockResolvedValueOnce({ object: judgeOutput() } as never)
            .mockResolvedValueOnce({ object: escalatedOutput } as never);

        const result = await makeService().replayJudge(replayInput);

        expect(generateObjectMock).toHaveBeenCalledTimes(2);
        expect(generateObjectMock).toHaveBeenLastCalledWith(
            expect.objectContaining({ model: ESCALATION_MODEL.model }),
        );
        expect(result.judgeOutput).toEqual(escalatedOutput);
    });

    it('lets the strong model demote a gate promotion', async () => {
        const demoted = judgeOutput({
            promotedToFinding: false,
            promotionReason: null,
            primaryRootCause: 'not_a_failure',
            signal: 'acceptance_or_continuation',
            implicitSignalSources: [],
        });
        generateObjectMock
            .mockResolvedValueOnce({ object: judgeOutput() } as never)
            .mockResolvedValueOnce({ object: demoted } as never);

        const result = await makeService().replayJudge(replayInput);

        expect(result.judgeOutput?.promotedToFinding).toBe(false);
    });

    it('skips escalation when disabled via options', async () => {
        const gateOutput = judgeOutput();
        generateObjectMock.mockResolvedValueOnce({
            object: gateOutput,
        } as never);

        const result = await makeService().replayJudge(replayInput, {
            escalationEnabled: false,
        });

        expect(generateObjectMock).toHaveBeenCalledTimes(1);
        expect(result.judgeOutput).toEqual(gateOutput);
    });

    it('skips escalation when the strong model is the same as the gate model', async () => {
        getModelMock.mockImplementation(() => GATE_MODEL as never);
        const gateOutput = judgeOutput();
        generateObjectMock.mockResolvedValueOnce({
            object: gateOutput,
        } as never);

        const result = await makeService().replayJudge(replayInput);

        expect(generateObjectMock).toHaveBeenCalledTimes(1);
        expect(result.judgeOutput).toEqual(gateOutput);
    });
});
