import { ParameterError } from '@lightdash/common';
import type express from 'express';
import { DocumentController } from './DocumentController';

describe('Document chart query boundary', () => {
    const setup = (body: Record<string, unknown>) => {
        const executeAsyncDocumentCellQuery = vi.fn().mockResolvedValue({
            queryUuid: 'query',
            cacheMetadata: { cacheHit: false },
        });
        const controller = new DocumentController({
            getAsyncQueryService: () => ({ executeAsyncDocumentCellQuery }),
        } as unknown as ConstructorParameters<typeof DocumentController>[0]);
        const request = {
            account: { user: { type: 'registered' } },
            body,
        } as unknown as express.Request;
        return { controller, request, executeAsyncDocumentCellQuery };
    };

    test('forwards only persisted cell identity', async () => {
        const { controller, request, executeAsyncDocumentCellQuery } = setup({
            versionUuid: 'version',
        });
        await expect(
            controller.executeCellQuery(
                request,
                'project',
                'document',
                'cell',
                { versionUuid: 'version' },
            ),
        ).resolves.toMatchObject({
            status: 'ok',
            results: { queryUuid: 'query' },
        });
        expect(executeAsyncDocumentCellQuery).toHaveBeenCalledWith({
            account: request.account,
            projectUuid: 'project',
            reference: {
                documentUuid: 'document',
                cellId: 'cell',
                versionUuid: 'version',
            },
        });
    });

    test.each([
        'query',
        'parameters',
        'userAttributeOverrides',
        'documentQueryContext',
        'documentSource',
    ])(
        'rejects a caller-supplied %s even when generated validation strips it',
        async (key) => {
            const { controller, request, executeAsyncDocumentCellQuery } =
                setup({ versionUuid: 'version', [key]: {} });
            await expect(
                controller.executeCellQuery(
                    request,
                    'project',
                    'document',
                    'cell',
                    { versionUuid: 'version' },
                ),
            ).rejects.toThrow(ParameterError);
            expect(executeAsyncDocumentCellQuery).not.toHaveBeenCalled();
        },
    );
});
