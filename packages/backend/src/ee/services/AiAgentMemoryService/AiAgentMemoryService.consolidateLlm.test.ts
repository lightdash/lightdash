import {
    AI_AGENT_MEMORY_PROMOTION_MIN_CITED_COUNT,
    type AnyType,
} from '@lightdash/common';
import { APICallError, generateText, NoOutputGeneratedError } from 'ai';
import { vi } from 'vitest';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { getModel } from '../ai/models';
import type { ReviewJudgeConfigResolver } from '../ai/reviewJudgeModel';
import { AiAgentMemoryService } from './AiAgentMemoryService';

vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateText: vi.fn(),
}));
vi.mock('../ai/models', () => ({ getModel: vi.fn() }));
vi.mock('../ai/agents/agentV2', () => ({ defaultAgentOptions: {} }));
vi.mock('../ai/utils/aiCallTelemetry', () => ({
    // Mirrors the real return shape. This service never emits usage, so
    // nothing here reads it today; the shape is kept honest so the mock does
    // not drift from the function it stands in for.
    getAiCallTelemetry: () => ({
        runtimeContext: { feature: 'ai-agent-memory' },
        telemetry: { functionId: 'test' },
    }),
    getLanguageModelAttribution: () => ({}),
}));

const generateTextMock = vi.mocked(generateText);
vi.mocked(getModel).mockReturnValue({
    model: { modelId: 'test-model' },
    callOptions: {},
    providerOptions: {},
} as AnyType);

// v7's NoOutputGeneratedError carries only message and cause; the object API's
// response/usage/finishReason fields are gone.
const schemaFailure = () =>
    new NoOutputGeneratedError({
        message: 'response did not match schema',
        cause: new Error('schema validation failed'),
    });

const retryableApiFailure = () =>
    new APICallError({
        message: 'provider unavailable',
        url: 'https://provider.example.test/generate',
        requestBodyValues: {},
        statusCode: 500,
    });

// The real consolidateWithLlm path: no canned consolidateCall injected.
const build = () => {
    const recordConsolidationRun = vi.fn().mockResolvedValue({});
    const applyConsolidation = vi
        .fn()
        .mockResolvedValue({ run: {}, applied: [], rejected: [] });
    const service = new AiAgentMemoryService({
        analytics: { track: vi.fn() } as AnyType,
        aiAgentMemoryModel: {
            findActiveForProject: vi.fn().mockResolvedValue(
                Array.from({ length: 30 }, (_, index) => ({
                    ai_agent_memory_uuid: `memory-${index}`,
                    slug: `net-revenue-${index}`,
                    title: 'Net revenue convention',
                    raw_memory: 'Use net revenue.',
                    terms: [],
                    objects: [],
                    scope: 'user',
                    cited_count: 10,
                    generated_at: new Date('2026-07-20T10:00:00Z'),
                })),
            ),
            findLatestConsolidationRun: vi.fn().mockResolvedValue(undefined),
            recordConsolidationRun,
            applyConsolidation,
        } as AnyType,
        aiAgentReviewClassifierModel: {
            findMemoryReviewItem: vi.fn(),
            upsertMemoryReviewItem: vi.fn(),
            upsertMemoryReviewItemInTransaction: vi.fn(),
        },
        aiAgentModel: {} as AnyType,
        groupsModel: {} as AnyType,
        projectModel: {
            findExploresFromCache: vi.fn().mockResolvedValue({
                orders: { name: 'orders', tables: {}, joinedTables: [] },
            }),
            getSummary: vi.fn(),
        } as AnyType,
        projectContextModel: { getDocument: vi.fn() },
        userModel: { findSessionUserAndOrgByUuid: vi.fn() } as AnyType,
        featureFlagService: {
            get: vi.fn(async ({ featureFlagId }) => ({
                id: featureFlagId,
                enabled: true,
            })),
        } as AnyType,
        aiOrganizationSettingsService: {
            isAiAgentMemoryEnabled: vi.fn().mockResolvedValue(true),
            isAiAgentReviewsEnabled: vi.fn().mockResolvedValue(true),
        },
        schedulerClient: {
            aiAgentMemoryDistill: vi.fn(),
            aiAgentMemoryConsolidatePartition: vi.fn(),
        },
        consolidationDryRun: false,
        orgAiCopilotConfigResolver: {
            getCopilotConfig: vi
                .fn<ReviewJudgeConfigResolver['getCopilotConfig']>()
                .mockResolvedValue({
                    ...lightdashConfigMock.ai.copilot,
                    byoProviders: [],
                }),
            getReviewJudgeAvailability:
                vi.fn<
                    ReviewJudgeConfigResolver['getReviewJudgeAvailability']
                >(),
        },
        lightdashConfig: lightdashConfigMock,
        distillCall: vi.fn(),
    });
    return { service, recordConsolidationRun, applyConsolidation };
};

const payload = {
    organizationUuid: 'org-enabled',
    projectUuid: 'project-enabled',
    userUuid: 'system',
    ownerUserUuid: 'owner-1',
};

describe('AiAgentMemoryService consolidateWithLlm retry', () => {
    beforeEach(() => {
        generateTextMock.mockReset();
    });

    it('shows citation counts and promotion guidance to the curator', async () => {
        const { service } = build();
        generateTextMock.mockResolvedValue({
            output: { operations: [] },
        } as AnyType);

        await service.consolidateScheduledPartition(payload);

        expect(generateTextMock).toHaveBeenCalledWith(
            expect.objectContaining({
                system: expect.stringContaining(
                    `Promotion requires at least ${AI_AGENT_MEMORY_PROMOTION_MIN_CITED_COUNT} citations`,
                ),
                messages: [
                    expect.objectContaining({
                        content: expect.stringContaining('"cited_count":10'),
                    }),
                ],
            }),
        );
        expect(generateTextMock.mock.calls[0]![0].system).not.toContain(
            '{{PROMOTION_MIN_CITED_COUNT}}',
        );
    });

    it('retries a one-off schema-validation failure once', async () => {
        const { service, recordConsolidationRun, applyConsolidation } = build();
        generateTextMock
            .mockRejectedValueOnce(schemaFailure())
            .mockResolvedValueOnce({ output: { operations: [] } } as AnyType);

        await expect(
            service.consolidateScheduledPartition(payload),
        ).resolves.toBe('consolidated');

        expect(generateTextMock).toHaveBeenCalledTimes(2);
        expect(applyConsolidation).toHaveBeenCalledOnce();
        expect(recordConsolidationRun).not.toHaveBeenCalled();
    });

    it('records a failed run when the schema failure repeats', async () => {
        const { service, recordConsolidationRun, applyConsolidation } = build();
        generateTextMock.mockRejectedValue(schemaFailure());

        await expect(
            service.consolidateScheduledPartition(payload),
        ).resolves.toBe('failed');

        expect(generateTextMock).toHaveBeenCalledTimes(2);
        expect(applyConsolidation).not.toHaveBeenCalled();
        expect(recordConsolidationRun).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ status: 'failed' }),
        );
    });

    it('retries a retryable API failure once within the two-call budget', async () => {
        const { service, recordConsolidationRun, applyConsolidation } = build();
        generateTextMock
            .mockRejectedValueOnce(retryableApiFailure())
            .mockResolvedValueOnce({ output: { operations: [] } } as AnyType);

        await expect(
            service.consolidateScheduledPartition(payload),
        ).resolves.toBe('consolidated');

        expect(generateTextMock).toHaveBeenCalledTimes(2);
        expect(generateTextMock).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ maxRetries: 0 }),
        );
        expect(generateTextMock).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ maxRetries: 0 }),
        );
        expect(applyConsolidation).toHaveBeenCalledOnce();
        expect(recordConsolidationRun).not.toHaveBeenCalled();
    });

    it('does not spend the retry on a non-schema failure', async () => {
        const { service, recordConsolidationRun } = build();
        generateTextMock.mockRejectedValue(new Error('provider down'));

        await expect(
            service.consolidateScheduledPartition(payload),
        ).resolves.toBe('failed');

        expect(generateTextMock).toHaveBeenCalledOnce();
        expect(recordConsolidationRun).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                status: 'failed',
                errorMessage: 'provider down',
            }),
        );
    });
});
