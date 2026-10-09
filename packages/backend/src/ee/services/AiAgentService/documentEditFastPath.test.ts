import { FeatureFlags } from '@lightdash/common';
import type { DocumentEditResolution } from '../ai/decisions/documentEdit';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

const markdown = [
    '# Payments review',
    '<document-chart id="c1" title="Revenue" type="Bar chart" explore="payments">',
    '<document-chart id="c2" title="Payment count" type="Bar chart" explore="payments">',
].join('\n\n');

const readResult = {
    type: 'document' as const,
    uuid: 'document',
    href: '/projects/p/documents/payments-review',
    versionUuid: '6f0b5f8e-0b8e-4a8e-9c1e-2d1b2a3c4d51',
    content: {
        name: 'Payments review',
        slug: 'payments-review',
        description: '',
        spaceSlug: 'jaffle-shop',
        schemaVersion: 2,
        markdown,
        chart: null,
    },
};

const user = {
    organizationUuid: 'organization',
    userUuid: 'user',
    ability: { can: () => true },
    abilityRules: [],
};
const prompt = {
    organizationUuid: 'organization',
    projectUuid: 'project',
    agentUuid: 'agent',
    promptUuid: 'prompt',
    threadUuid: 'thread',
    createdByUserUuid: 'user',
    prompt: 'remove the payment count chart',
};
const agent = {
    uuid: 'agent',
    enableDataAccess: true,
    enableContentTools: true,
    tags: null,
    spaceAccess: null,
};

type PrivateService = {
    createAuditedAbility: (...args: unknown[]) => { can: () => boolean };
    respondWithStaticText: (args: unknown) => Promise<unknown>;
    loadDocumentTurnContext: (args: unknown) => Promise<unknown>;
    tryApplyDocumentEdit: (args: unknown) => Promise<unknown>;
};

const setup = ({
    pinnedDocumentSlug = 'document' as string | null,
    authorized = true,
    documentsEnabled = true,
    interrupted = false,
    promptContext = ['document'] as string[],
} = {}) => {
    const aiAgentModel = {
        findThreadDocumentSlug: vi.fn().mockResolvedValue(pinnedDocumentSlug),
        getContextForPromptUuids: vi
            .fn()
            .mockResolvedValue(
                new Map([['prompt', promptContext.map((type) => ({ type }))]]),
            ),
        hasAiPromptInterrupt: vi.fn().mockResolvedValue(interrupted),
        createToolCall: vi.fn().mockResolvedValue(undefined),
        createToolResults: vi.fn().mockResolvedValue(undefined),
        createPromptDecision: vi.fn().mockResolvedValue(undefined),
    };
    const runtime = {
        readContent: vi.fn().mockResolvedValue(readResult),
        editContent: vi.fn().mockResolvedValue({
            ...readResult,
            versionUuid: '6f0b5f8e-0b8e-4a8e-9c1e-2d1b2a3c4d52',
        }),
    };
    const service = new AiAgentService({
        aiAgentModel,
        analytics: { track: vi.fn() },
        featureFlagService: {
            get: vi.fn(
                async ({ featureFlagId }: { featureFlagId: string }) => ({
                    enabled:
                        featureFlagId === FeatureFlags.Documents &&
                        documentsEnabled,
                }),
            ),
        },
        aiAgentToolsService: {
            createRuntime: vi.fn().mockReturnValue(runtime),
        },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    const privateService = service as unknown as PrivateService;
    vi.spyOn(privateService, 'createAuditedAbility').mockReturnValue({
        can: () => authorized,
    });
    const stream = { pipeUIMessageStreamToResponse: vi.fn() };
    const respond = vi
        .spyOn(privateService, 'respondWithStaticText')
        .mockResolvedValue(stream);
    return { privateService, aiAgentModel, runtime, respond, stream };
};

const load = (privateService: PrivateService) =>
    privateService.loadDocumentTurnContext({ user, prompt, agent });

describe('Document fast edit context', () => {
    it('reads the Document pinned to the thread', async () => {
        const { privateService, runtime } = setup();
        await expect(load(privateService)).resolves.toMatchObject({
            context: {
                slug: 'payments-review',
                versionUuid: '6f0b5f8e-0b8e-4a8e-9c1e-2d1b2a3c4d51',
                charts: [
                    { id: 'c1', name: 'Revenue' },
                    { id: 'c2', name: 'Payment count' },
                ],
            },
        });
        expect(runtime.readContent).toHaveBeenCalledWith({
            type: 'document',
            slug: 'document',
            chartId: null,
        });
    });

    test.each([
        { name: 'no pinned Document', pinnedDocumentSlug: null },
        { name: 'no ContentAsCode access', authorized: false },
        { name: 'Documents flag off', documentsEnabled: false },
        {
            name: 'other content pinned to the prompt',
            promptContext: ['document', 'chart'],
        },
    ])('skips the fast path with $name', async (options) => {
        const { privateService, runtime } = setup(options);
        await expect(load(privateService)).resolves.toBeNull();
        expect(runtime.readContent).not.toHaveBeenCalled();
    });
});

describe('Document fast edit', () => {
    const intent: DocumentEditResolution = {
        type: 'intent',
        intent: { kind: 'remove_chart', chartId: 'c2' },
    };
    const apply = async (
        resolution: DocumentEditResolution,
        options: Parameters<typeof setup>[0] = {},
    ) => {
        const fixture = setup(options);
        const document = await load(fixture.privateService);
        const reply = await fixture.privateService.tryApplyDocumentEdit({
            user,
            prompt,
            agent,
            decisions: { modelName: 'jev-test' },
            document,
            decision: { resolution, answers: {} },
            latencyMs: 250,
            serviceMs: 120,
            responseStartedAt: Date.now(),
            decisionUsage: () => ({ inputTokens: 1, outputTokens: 1 }),
        });
        return { ...fixture, reply };
    };

    it('applies the edit through editContent and streams it as a tool call', async () => {
        const { reply, stream, runtime, aiAgentModel, respond } =
            await apply(intent);

        expect(reply).toBe(stream);
        expect(runtime.editContent).toHaveBeenCalledWith({
            slug: 'payments-review',
            type: 'document',
            documentEdit: {
                type: 'content',
                baseVersionUuid: '6f0b5f8e-0b8e-4a8e-9c1e-2d1b2a3c4d51',
                markdown: '# Payments review\n\n<document-chart id="c1">',
                charts: {},
            },
        });
        expect(aiAgentModel.createToolCall).toHaveBeenCalledWith(
            expect.objectContaining({
                toolCallId: expect.stringMatching(/^jev_/),
                toolName: 'editContent',
            }),
        );
        expect(respond).toHaveBeenCalledWith(
            expect.objectContaining({
                text: 'Removed **Payment count** from the Document.',
                toolCall: expect.objectContaining({
                    toolCallId: expect.stringMatching(/^jev_/),
                    output: expect.objectContaining({
                        metadata: expect.objectContaining({
                            status: 'success',
                        }),
                    }),
                }),
            }),
        );
        expect(aiAgentModel.createPromptDecision).toHaveBeenCalledWith(
            expect.objectContaining({
                operation: 'document-edit',
                outcome: 'intent',
                applied: true,
                intent: { kind: 'remove_chart', chartId: 'c2' },
            }),
        );
    });

    it('records an unsure decision and leaves the turn to the agent', async () => {
        const { reply, runtime, aiAgentModel } = await apply({
            type: 'unresolved',
            reason: 'chart',
        });

        expect(reply).toBeNull();
        expect(runtime.editContent).not.toHaveBeenCalled();
        expect(aiAgentModel.createPromptDecision).toHaveBeenCalledWith(
            expect.objectContaining({
                operation: 'document-edit',
                outcome: 'unresolved',
                reason: 'chart',
                applied: false,
            }),
        );
    });

    it('does not edit after the user interrupted the prompt', async () => {
        const { reply, runtime, aiAgentModel } = await apply(intent, {
            interrupted: true,
        });

        expect(reply).toBeNull();
        expect(runtime.editContent).not.toHaveBeenCalled();
        expect(aiAgentModel.createPromptDecision).toHaveBeenCalledWith(
            expect.objectContaining({ fallback_reason: 'interrupted' }),
        );
    });

    it('falls back without persisting a tool call when the edit fails', async () => {
        const fixture = setup();
        fixture.runtime.editContent.mockRejectedValue(
            new Error('Document has changed'),
        );
        const document = await load(fixture.privateService);
        const reply = await fixture.privateService.tryApplyDocumentEdit({
            user,
            prompt,
            agent,
            decisions: { modelName: 'jev-test' },
            document,
            decision: { resolution: intent, answers: {} },
            latencyMs: 250,
            serviceMs: 120,
            responseStartedAt: Date.now(),
            decisionUsage: () => ({ inputTokens: 1, outputTokens: 1 }),
        });

        expect(reply).toBeNull();
        expect(fixture.aiAgentModel.createToolCall).not.toHaveBeenCalled();
        expect(fixture.respond).not.toHaveBeenCalled();
        expect(fixture.aiAgentModel.createPromptDecision).toHaveBeenCalledWith(
            expect.objectContaining({
                applied: false,
                fallback_reason: 'edit-failed',
            }),
        );
    });
});
