import { toolSearchApiOutputSchema } from '@lightdash/common';
import { getGenerativeUiApiCatalog } from '../generativeUi/apiOperationCatalog';
import { getSearchApi } from './searchApi';

const search = async (query: string, kind: 'query' | 'mutation' | null) => {
    const tool = getSearchApi({ catalog: getGenerativeUiApiCatalog() });
    if (!tool.execute) throw new Error('tool has no execute');
    const output = await tool.execute(
        { query, kind },
        { messages: [], toolCallId: 'tool-call-1', context: {} },
    );
    expect(toolSearchApiOutputSchema.safeParse(output).success).toBe(true);
    return toolSearchApiOutputSchema.parse(output);
};

describe('searchApi', () => {
    it('returns matches as text and as structured operations', async () => {
        const output = await search('move charts to a space', 'mutation');

        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.structuredContent).toMatchObject({
            operations: expect.arrayContaining([
                {
                    operationId: 'Move content',
                    method: 'POST',
                    pathTemplate: '/api/v2/content/{projectUuid}/move',
                    kind: 'mutation',
                    summary: 'Move content',
                },
            ]),
        });
        expect(output.result.split('\n')[0]).toBe(
            '- Move content (mutation): POST /api/v2/content/{projectUuid}/move — Move content',
        );
    });

    it('says so when nothing matches', async () => {
        const output = await search('zebra', null);

        expect(output.structuredContent).toEqual({ operations: [] });
        expect(output.result).toContain('No matching operations');
    });
});
