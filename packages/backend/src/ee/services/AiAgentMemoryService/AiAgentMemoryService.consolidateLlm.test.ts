import { type AnyType } from '@lightdash/common';
import { APICallError, generateObject, NoObjectGeneratedError } from 'ai';
import { vi } from 'vitest';
import { getModel } from '../ai/models';
import { AiAgentMemoryService } from './AiAgentMemoryService';

vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateObject: vi.fn(),
}));
vi.mock('../ai/models', () => ({ getModel: vi.fn() }));
vi.mock('../ai/agents/agentV2', () => ({ defaultAgentOptions: {} }));
vi.mock('../ai/utils/aiCallTelemetry', () => ({
    getAiCallTelemetry: () => ({ functionId: 'test', metadata: {} }),
    getLanguageModelAttribution: () => ({}),
}));

const generateObjectMock = vi.mocked(generateObject);
vi.mocked(getModel).mockReturnValue({
    model: { modelId: 'test-model' },
    callOptions: {},
    providerOptions: {},
} as AnyType);

const schemaFailure = () =>
    new NoObjectGeneratedError({
        message: 'response did not match schema',
        response: { id: 'resp-1', timestamp: new Date(), modelId: 'model-1' },
        usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            inputTokenDetails: {},
            outputTokenDetails: {},
        } as AnyType,
        finishReason: 'stop',
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
                    generated_at: new Date('2026-07-20T10:00:00Z'),
                })),
            ),
            findLatestConsolidationRun: vi.fn().mockResolvedValue(undefined),
            recordConsolidationRun,
            applyConsolidation,
        } as AnyType,
        aiAgentModel: {} as AnyType,
        groupsModel: {} as AnyType,
        projectModel: {
            findExploresFromCache: vi.fn().mockResolvedValue({
                orders: { name: 'orders', tables: {}, joinedTables: [] },
            }),
            getSummary: vi.fn(),
        } as AnyType,
        featureFlagService: {
            get: vi.fn(async ({ featureFlagId }) => ({
                id: featureFlagId,
                enabled: true,
            })),
        } as AnyType,
        schedulerClient: {
            aiAgentMemoryDistill: vi.fn(),
            aiAgentMemoryConsolidatePartition: vi.fn(),
        },
        consolidationDryRun: false,
        orgAiCopilotConfigResolver: {
            getCopilotConfig: vi
                .fn()
                .mockResolvedValue({ telemetryEnabled: false }),
        } as AnyType,
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
        generateObjectMock.mockReset();
    });

    it('retries a one-off schema-validation failure once', async () => {
        const { service, recordConsolidationRun, applyConsolidation } = build();
        generateObjectMock
            .mockRejectedValueOnce(schemaFailure())
            .mockResolvedValueOnce({ object: { operations: [] } } as AnyType);

        await expect(
            service.consolidateScheduledPartition(payload),
        ).resolves.toBe('consolidated');

        expect(generateObjectMock).toHaveBeenCalledTimes(2);
        expect(applyConsolidation).toHaveBeenCalledOnce();
        expect(recordConsolidationRun).not.toHaveBeenCalled();
    });

    it('records a failed run when the schema failure repeats', async () => {
        const { service, recordConsolidationRun, applyConsolidation } = build();
        generateObjectMock.mockRejectedValue(schemaFailure());

        await expect(
            service.consolidateScheduledPartition(payload),
        ).resolves.toBe('failed');

        expect(generateObjectMock).toHaveBeenCalledTimes(2);
        expect(applyConsolidation).not.toHaveBeenCalled();
        expect(recordConsolidationRun).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ status: 'failed' }),
        );
    });

    it('retries a retryable API failure once within the two-call budget', async () => {
        const { service, recordConsolidationRun, applyConsolidation } = build();
        generateObjectMock
            .mockRejectedValueOnce(retryableApiFailure())
            .mockResolvedValueOnce({ object: { operations: [] } } as AnyType);

        await expect(
            service.consolidateScheduledPartition(payload),
        ).resolves.toBe('consolidated');

        expect(generateObjectMock).toHaveBeenCalledTimes(2);
        expect(generateObjectMock).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ maxRetries: 0 }),
        );
        expect(generateObjectMock).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ maxRetries: 0 }),
        );
        expect(applyConsolidation).toHaveBeenCalledOnce();
        expect(recordConsolidationRun).not.toHaveBeenCalled();
    });

    it('does not spend the retry on a non-schema failure', async () => {
        const { service, recordConsolidationRun } = build();
        generateObjectMock.mockRejectedValue(new Error('provider down'));

        await expect(
            service.consolidateScheduledPartition(payload),
        ).resolves.toBe('failed');

        expect(generateObjectMock).toHaveBeenCalledOnce();
        expect(recordConsolidationRun).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                status: 'failed',
                errorMessage: 'provider down',
            }),
        );
    });
});
