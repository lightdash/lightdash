import type { ModelMessage } from 'ai';
import { compactChartDiscovery, getPreviousQueryUuid } from './previousQuery';

const messages: ModelMessage[] = [
    { role: 'user', content: 'Count orders last quarter' },
    {
        role: 'assistant',
        content: [
            {
                type: 'tool-call',
                toolCallId: 'query',
                toolName: 'runQuery',
                input: { queryConfig: { filters: { region: 'west' } } },
            },
        ],
    },
    {
        role: 'tool',
        content: [
            {
                type: 'tool-result',
                toolCallId: 'query',
                toolName: 'runQuery',
                output: {
                    type: 'json',
                    value: {
                        status: 'success',
                        queryUuid: 'original',
                        result: '12 orders',
                    },
                },
            },
        ],
    },
    { role: 'assistant', content: '12 orders' },
    { role: 'user', content: 'Show those as bars' },
];
describe('previous query references', () => {
    it('retains only the immediately preceding persisted successful query', () => {
        expect(getPreviousQueryUuid(messages)).toBe('original');
        expect(
            getPreviousQueryUuid([
                ...messages,
                { role: 'assistant', content: 'Done' },
                { role: 'user', content: 'Another chart' },
            ]),
        ).toBeUndefined();
    });
    it.each(['error', null])(
        'does not reuse a result without explicit success: %s',
        (status) => {
            const copy = structuredClone(messages);
            copy[2] = {
                role: 'tool',
                content: [
                    {
                        type: 'tool-result',
                        toolCallId: 'query',
                        toolName: 'runQuery',
                        output: {
                            type: 'json',
                            value: { status, queryUuid: 'original' },
                        },
                    },
                ],
            };
            expect(getPreviousQueryUuid(copy)).toBeUndefined();
        },
    );
    it('never skips a newer failed query to reuse an older success', () => {
        const history = [
            ...messages.slice(0, -1),
            {
                role: 'assistant',
                content: [
                    {
                        type: 'tool-call',
                        toolCallId: 'failed',
                        toolName: 'runQuery',
                        input: {},
                    },
                ],
            },
            messages.at(-1)!,
        ] as ModelMessage[];
        expect(getPreviousQueryUuid(history)).toBeUndefined();
    });
    it('compacts only discovery payloads, preserving instructions, documents, query scope and errors', () => {
        const history: ModelMessage[] = [
            { role: 'system', content: 'Never change the user scope' },
            {
                role: 'tool',
                content: [
                    {
                        type: 'tool-result',
                        toolCallId: 'fields',
                        toolName: 'grepFields',
                        output: {
                            type: 'json',
                            value: {
                                status: 'success',
                                result: 'catalog '.repeat(10000),
                            },
                        },
                    },
                    {
                        type: 'tool-result',
                        toolCallId: 'doc',
                        toolName: 'getKnowledgeDocumentContent',
                        output: {
                            type: 'text',
                            value: 'Revenue excludes refunds',
                        },
                    },
                    {
                        type: 'tool-result',
                        toolCallId: 'json-error',
                        toolName: 'grepFields',
                        output: {
                            type: 'json',
                            value: {
                                status: 'error',
                                result: 'Field unavailable',
                            },
                        },
                    },
                    {
                        type: 'tool-result',
                        toolCallId: 'error',
                        toolName: 'getMetadata',
                        output: {
                            type: 'error-text',
                            value: 'Permission denied',
                        },
                    },
                ],
            },
            ...messages,
        ];
        const compact = compactChartDiscovery(history);
        expect(JSON.stringify(compact).length).toBeLessThan(
            JSON.stringify(history).length / 10,
        );
        expect(compact[0]).toEqual(history[0]);
        expect(compact.slice(2)).toEqual(messages);
        expect(JSON.stringify(compact)).toContain('Revenue excludes refunds');
        expect(JSON.stringify(compact)).toContain('Permission denied');
        expect(JSON.stringify(compact)).toContain('Field unavailable');
        expect(JSON.stringify(history)).toContain('catalog catalog');
    });
});
