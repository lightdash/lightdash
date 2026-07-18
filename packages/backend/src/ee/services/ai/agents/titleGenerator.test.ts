import { generateObject } from 'ai';
import { generateThreadTitle, TITLE_MAX_LENGTH_CHARS } from './titleGenerator';

vi.mock('ai', () => ({ generateObject: vi.fn() }));
vi.mock('../../../../analytics/aiUsage', () => ({
    emitAiUsage: vi.fn(),
    languageModelUsageToTokens: vi.fn(() => ({})),
}));
vi.mock('../utils/aiCallTelemetry', () => ({
    getGeneratorTelemetry: () => ({}),
}));

const generateObjectMock = vi.mocked(generateObject);

const modelOptions = {
    model: { modelId: 'test-model' },
    callOptions: {},
    providerOptions: {},
} as Parameters<typeof generateThreadTitle>[0];

describe('generateThreadTitle', () => {
    beforeEach(() => {
        generateObjectMock.mockReset();
    });

    it('stores short model titles verbatim', async () => {
        const title = 'Order data analysis for last 30 days';
        generateObjectMock.mockResolvedValueOnce({
            object: { title },
            usage: {},
        } as never);

        await expect(generateThreadTitle(modelOptions, [])).resolves.toBe(
            title,
        );
    });

    it('truncates model titles longer than 60 characters instead of throwing', async () => {
        const longTitle =
            'Monthly payment trends by partner for fiscal twenty twenty six extra';
        generateObjectMock.mockResolvedValueOnce({
            object: { title: longTitle },
            usage: {},
        } as never);

        const title = await generateThreadTitle(modelOptions, []);

        expect(title.length).toBeLessThanOrEqual(TITLE_MAX_LENGTH_CHARS);
        expect(title.endsWith('...')).toBe(true);
    });
});
