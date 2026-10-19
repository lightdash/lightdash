import { type AgentSuggestionModelChip } from '@lightdash/common';
import { generateText, NoObjectGeneratedError } from 'ai';
import { type GeneratorModelOptions } from '../models/types';
import { SuggestionGenerationError } from './suggestionErrors';
import {
    buildSuggestionSystemPrompt,
    generateAgentSuggestions,
    stripMarkdownCodeFences,
    type SuggestionPromptContext,
} from './suggestionGenerator';

vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateText: vi.fn(),
}));
vi.mock('../../../../analytics/aiUsage', () => ({
    emitAiUsage: vi.fn(),
    languageModelUsageToTokens: vi.fn(),
}));

const model = {
    model: { modelId: 'test', provider: 'openai' },
    callOptions: {},
    providerOptions: {},
    keyManagement: null,
} as unknown as GeneratorModelOptions;
const context: SuggestionPromptContext = {
    agentName: 'Agent',
    agentInstruction: null,
    canManageContent: false,
    enabledTools: ['findContent'],
    explores: [],
    verifiedQuestions: [],
    verifiedContentTags: [],
    verifiedContent: [],
};
const chips: AgentSuggestionModelChip[] = [
    {
        kind: 'prompt',
        label: 'Find existing charts',
        tool: 'findContent',
        defaults: {
            explore: null,
            dimensions: [],
            metrics: [],
            timeframe: null,
        },
    },
    {
        kind: 'navigate',
        label: 'Resume recent analysis',
        recentConversationIndex: 0,
    },
];
const failWithText = (text: string | undefined) =>
    vi.mocked(generateText).mockRejectedValueOnce(
        new NoObjectGeneratedError({
            text,
            response: {
                id: 'response',
                timestamp: new Date(),
                modelId: 'test',
            },
            finishReason: 'stop',
            usage: {
                inputTokens: 1,
                outputTokens: 1,
                totalTokens: 2,
                inputTokenDetails: {
                    noCacheTokens: 1,
                    cacheReadTokens: 0,
                    cacheWriteTokens: 0,
                },
                outputTokenDetails: { textTokens: 1, reasoningTokens: 0 },
            },
        }),
    );

describe('generateAgentSuggestions', () => {
    beforeEach(() => vi.clearAllMocks());
    it('returns structured output with no drops', async () => {
        vi.mocked(generateText).mockResolvedValueOnce({
            output: { chips },
            usage: {},
        } as unknown as Awaited<ReturnType<typeof generateText>>);
        expect(await generateAgentSuggestions(model, context)).toEqual({
            chips,
            droppedChipCount: 0,
            droppedReasons: [],
        });
        expect(generateText).toHaveBeenCalledWith(
            expect.objectContaining({ output: expect.anything() }),
        );
    });
    it('salvages fenced JSON with all chips valid', async () => {
        failWithText(` \n\`\`\`json\n${JSON.stringify({ chips })}\n\`\`\`\n `);
        expect(await generateAgentSuggestions(model, context)).toEqual({
            chips,
            droppedChipCount: 0,
            droppedReasons: [],
        });
    });
    it('salvages one valid chip from a top-level array and counts invalid chips', async () => {
        failWithText(
            JSON.stringify([chips[0], { kind: 'prompt', label: 'bad' }, null]),
        );
        const result = await generateAgentSuggestions(model, context);
        expect(result.chips).toEqual([chips[0]]);
        expect(result.droppedChipCount).toBe(2);
        expect(result.droppedReasons).toHaveLength(2);
    });
    it('caps salvaged chips at six', async () => {
        failWithText(
            JSON.stringify({
                chips: Array.from({ length: 8 }, () => chips[0]),
            }),
        );
        expect(
            (await generateAgentSuggestions(model, context)).chips,
        ).toHaveLength(6);
    });
    it.each(['garbage', undefined])(
        'reports parse failure for %s',
        async (text) => {
            failWithText(text);
            await expect(
                generateAgentSuggestions(model, context),
            ).rejects.toMatchObject({ reason: 'parse' });
        },
    );
    it.each(['{"chips":[{}]}', '{"chips":[]}', '{}', 'null'])(
        'reports schema failure for %s',
        async (text) => {
            failWithText(text);
            await expect(
                generateAgentSuggestions(model, context),
            ).rejects.toMatchObject({ reason: 'schema' });
        },
    );
    it('propagates provider failures', async () => {
        const error = new Error('unavailable');
        vi.mocked(generateText).mockRejectedValueOnce(error);
        await expect(generateAgentSuggestions(model, context)).rejects.toBe(
            error,
        );
        expect(error).not.toBeInstanceOf(SuggestionGenerationError);
    });
});

describe('stripMarkdownCodeFences', () => {
    it.each([
        [' \n```json\n{}\n``` \n', '{}'],
        ['```\n[]\n```', '[]'],
        ['  {}  ', '{}'],
        ['{"label":"```"}', '{"label":"```"}'],
    ])('strips enclosing fences from %s', (text, expected) => {
        expect(stripMarkdownCodeFences(text)).toBe(expected);
    });
});

describe('buildSuggestionSystemPrompt', () => {
    it('appends the no-content-edit rule when the agent cannot manage content', () => {
        const postResponse = buildSuggestionSystemPrompt({
            isPostResponse: true,
            canManageContent: false,
        });
        const emptyState = buildSuggestionSystemPrompt({
            isPostResponse: false,
            canManageContent: false,
        });

        expect(postResponse).toContain('CAPABILITY LIMIT');
        expect(postResponse).toContain('CANNOT manage Lightdash content');
        expect(emptyState).toContain('CAPABILITY LIMIT');
    });

    it('omits the no-content-edit rule when the agent can manage content', () => {
        const postResponse = buildSuggestionSystemPrompt({
            isPostResponse: true,
            canManageContent: true,
        });
        const emptyState = buildSuggestionSystemPrompt({
            isPostResponse: false,
            canManageContent: true,
        });

        expect(postResponse).not.toContain('CAPABILITY LIMIT');
        expect(emptyState).not.toContain('CAPABILITY LIMIT');
    });

    it('selects the post-response vs empty-state base prompt', () => {
        const postResponse = buildSuggestionSystemPrompt({
            isPostResponse: true,
            canManageContent: true,
        });
        const emptyState = buildSuggestionSystemPrompt({
            isPostResponse: false,
            canManageContent: true,
        });

        expect(postResponse).toContain('AFTER the agent has just replied');
        expect(emptyState).toContain('starter "chips"');
    });

    it('prioritizes pinned content in both suggestion modes', () => {
        const postResponse = buildSuggestionSystemPrompt({
            isPostResponse: true,
            canManageContent: true,
        });
        const emptyState = buildSuggestionSystemPrompt({
            isPostResponse: false,
            canManageContent: true,
        });

        expect(postResponse).toContain('<pinnedContext>');
        expect(emptyState).toContain('pinnedContext: PRIMARY SIGNAL');
    });
});
