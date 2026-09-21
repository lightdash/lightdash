import { repairQueryToolCall } from './queryToolCallRepair';

describe('query tool-call repair', () => {
    it('does not invent missing query containers', async () => {
        const repaired = await repairQueryToolCall({
            toolCall: {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'runQuery',
                input: JSON.stringify({
                    queryConfig: {
                        metrics: ['orders_count'],
                        filters: { type: 'and', dimensions: [] },
                    },
                }),
            },
            tools: {} as never,
            inputSchema: async () => ({
                type: 'object',
                required: ['queryConfig'],
                properties: {
                    queryConfig: {
                        type: 'object',
                        required: ['metrics', 'parameters', 'filters'],
                        properties: {
                            metrics: {
                                type: 'array',
                                items: { type: 'string' },
                            },
                            parameters: {
                                anyOf: [{ type: 'object' }, { type: 'null' }],
                            },
                            filters: {
                                type: 'object',
                                required: [
                                    'type',
                                    'dimensions',
                                    'metrics',
                                    'tableCalculations',
                                ],
                                properties: {
                                    type: { type: 'string' },
                                    dimensions: { type: 'array' },
                                    metrics: { type: 'array' },
                                    tableCalculations: { type: 'array' },
                                },
                            },
                        },
                    },
                },
            }),
            system: undefined,
            messages: [],
            error: new Error('invalid') as never,
        });
        expect(repaired).toBeNull();
    });

    it('turns a model null placeholder into schema-valid null', async () => {
        const repaired = await repairQueryToolCall({
            toolCall: {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'generateVisualization',
                input: JSON.stringify({ mergeConfig: 'None' }),
            },
            tools: {} as never,
            inputSchema: async () => ({
                type: 'object',
                properties: {
                    mergeConfig: {
                        anyOf: [{ type: 'object' }, { type: 'null' }],
                    },
                },
            }),
            system: undefined,
            messages: [],
            error: new Error('invalid') as never,
        });
        expect(JSON.parse(repaired?.input ?? '')).toEqual({
            mergeConfig: null,
        });
    });

    it('does not repair unrelated tools', async () => {
        await expect(
            repairQueryToolCall({
                toolCall: {
                    type: 'tool-call',
                    toolCallId: 'call-1',
                    toolName: 'editRepo',
                    input: '{}',
                },
                tools: {} as never,
                inputSchema: async () => ({ type: 'object' }),
                system: undefined,
                messages: [],
                error: new Error('invalid') as never,
            }),
        ).resolves.toBeNull();
    });
});
