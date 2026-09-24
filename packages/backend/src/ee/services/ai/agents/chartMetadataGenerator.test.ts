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
