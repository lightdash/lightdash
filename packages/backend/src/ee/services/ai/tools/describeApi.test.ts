import { toolDescribeApiOutputSchema } from '@lightdash/common';
import { getGenerativeUiApiCatalog } from '../generativeUi/apiOperationCatalog';
import { getDescribeApi } from './describeApi';

const describeOperation = async (operationId: string) => {
    const tool = getDescribeApi({ catalog: getGenerativeUiApiCatalog() });
    if (!tool.execute) throw new Error('tool has no execute');
    const output = await tool.execute(
        { operationId },
        { messages: [], toolCallId: 'tool-call-1', context: {} },
    );
    expect(toolDescribeApiOutputSchema.safeParse(output).success).toBe(true);
    return toolDescribeApiOutputSchema.parse(output);
};

describe('describeApi', () => {
    it('returns the signature as text and structured content', async () => {
        const output = await describeOperation('DeleteSpace');

        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.structuredContent).toMatchObject({
            operationId: 'DeleteSpace',
            method: 'DELETE',
            pathTemplate: '/api/v1/projects/{projectUuid}/spaces/{spaceUuid}',
            kind: 'mutation',
            pathParams: ['spaceUuid'],
            autoFilledPathParams: ['projectUuid'],
        });
        expect(output.structuredContent).toMatchObject({
            signature: output.result,
        });
    });

    it('returns an error for an operation it does not know', async () => {
        const output = await describeOperation('updateSavedChart');

        expect(output).toEqual({
            result: 'Unknown operation "updateSavedChart". Find one with searchApi.',
            metadata: { status: 'error' },
            structuredContent: {
                error: 'Unknown operation "updateSavedChart". Find one with searchApi.',
            },
        });
    });
});
