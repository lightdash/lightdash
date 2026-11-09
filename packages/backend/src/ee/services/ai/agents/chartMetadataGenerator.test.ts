import { MockLanguageModelV3 } from 'ai/test';
import {
    generateChartMetadata,
    type ChartMetadataContext,
} from './chartMetadataGenerator';

const context: ChartMetadataContext = {
    tableName: 'Work orders',
    chartType: 'bar',
    dimensions: ['work_orders_category'],
    metrics: ['work_orders_count'],
    fieldsContext: [],
};

const systemPromptFor = async (input: ChartMetadataContext) => {
    let system = '';
    await generateChartMetadata(
        {
            keyManagement: null,
            model: new MockLanguageModelV3({
                doGenerate: async (options) => {
                    const message = options.prompt.find(
                        ({ role }) => role === 'system',
                    );
                    system =
                        message && typeof message.content === 'string'
                            ? message.content
                            : '';
                    return {
                        content: [
                            {
                                type: 'text',
                                text: '{"title":"Work orders by category","description":"Counts per category."}',
                            },
                        ],
                        finishReason: { unified: 'stop', raw: undefined },
                        usage: {
                            inputTokens: {
                                total: 1,
                                noCache: 1,
                                cacheRead: 0,
                                cacheWrite: 0,
                            },
                            outputTokens: { total: 1, text: 1, reasoning: 0 },
                        },
                        warnings: [],
                    };
                },
            }),
        },
        input,
    );
    return system;
};

describe('generateChartMetadata', () => {
    it('keeps the default prompt free of style guidance', async () => {
        const system = await systemPromptFor(context);
        expect(system).not.toContain('Match the voice');
        expect(system.endsWith('reference them in the description.\n')).toBe(
            true,
        );
    });

    it('uses the question style by default', async () => {
        const system = await systemPromptFor(context);
        expect(system).toContain(
            'Title: Be specific. Represent the title as a data question that it answers.',
        );
        expect(await systemPromptFor({ ...context, style: 'question' })).toBe(
            system,
        );
    });

    it('asks for a compact Title Case heading in the compact style', async () => {
        const system = await systemPromptFor({ ...context, style: 'compact' });
        expect(system).toContain('compact heading in Title Case');
        expect(system).not.toContain('data question');
        expect(system).toContain('Reference filters in the title');
    });

    it('asks for a 2 to 4 word label without filters in the short style', async () => {
        const system = await systemPromptFor({ ...context, style: 'short' });
        expect(system).toContain('very short label of 2 to 4 words');
        expect(system).toContain('no more than 12 words');
        expect(system).toContain('Leave filters out of the title');
        expect(system).not.toContain('Reference filters in the title');
    });

    it('lets a reference title set the style instead of asking for a question', async () => {
        const system = await systemPromptFor({
            ...context,
            styleReferenceTitle: 'Work orders per month in 2024',
        });
        expect(system).not.toContain('data question');
        expect(system).toContain(
            'Follow the voice and format of the existing title',
        );
    });

    it('prefers an explicit style over a reference title', async () => {
        const system = await systemPromptFor({
            ...context,
            style: 'short',
            styleReferenceTitle: 'Work orders per month in 2024',
        });
        expect(system).toContain('very short label of 2 to 4 words');
        expect(system).not.toContain('Match the voice');
    });

    it('quotes the reference title so its own quotes cannot break out', async () => {
        const system = await systemPromptFor({
            ...context,
            styleReferenceTitle: 'Orders "by" region',
        });
        expect(system).toContain('now: "Orders \\"by\\" region"');
    });

    it('asks to match an existing title when one is given', async () => {
        expect(
            await systemPromptFor({
                ...context,
                styleReferenceTitle: 'Work orders per month in 2024',
            }),
        ).toContain(
            'Match the voice and format of this existing title (statement or question, casing, length), but describe the chart as it is now: "Work orders per month in 2024"',
        );
    });
});
