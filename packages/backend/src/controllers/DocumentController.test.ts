import { ParameterError } from '@lightdash/common';
import type express from 'express';
import { DocumentController } from './DocumentController';

describe('Document read boundary', () => {
    test.each(['weekly-review', '36d4516a-3af0-48f6-9b47-d50956301501'])(
        'resolves identifier %s using the project-scoped reader',
        async (identifier) => {
            const getByIdOrSlug = vi
                .fn()
                .mockResolvedValue({ documentUuid: 'resolved' });
            const controller = new DocumentController({
                getDocumentService: () => ({ getByIdOrSlug }),
            } as unknown as ConstructorParameters<
                typeof DocumentController
            >[0]);
            const request = {
                account: { user: { type: 'registered' } },
            } as unknown as express.Request;
            await expect(
                controller.get(request, 'project', identifier),
            ).resolves.toEqual({
                status: 'ok',
                results: { documentUuid: 'resolved' },
            });
            expect(getByIdOrSlug).toHaveBeenCalledWith(
                request.account,
                'project',
                identifier,
            );
        },
    );
});

describe('Document duplicate boundary', () => {
    test('forwards the source identifier and destination to the authorized service', async () => {
        const duplicate = vi
            .fn()
            .mockResolvedValue({ documentUuid: 'new-document' });
        const controller = new DocumentController({
            getDocumentService: () => ({ duplicate }),
        } as unknown as ConstructorParameters<typeof DocumentController>[0]);
        const request = {
            account: { user: { type: 'registered' } },
        } as unknown as express.Request;
        const body = { name: 'Copy', spaceUuid: 'destination' };
        await expect(
            controller.duplicate(request, 'project', 'weekly-review', body),
        ).resolves.toEqual({
            status: 'ok',
            results: { documentUuid: 'new-document' },
        });
        expect(duplicate).toHaveBeenCalledWith(
            request.account,
            'project',
            'weekly-review',
            body,
        );
    });
});

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
            controller.executeCellQuery(request, 'project', 'document', 0, {
                versionUuid: 'version',
            }),
        ).resolves.toMatchObject({
            status: 'ok',
            results: { queryUuid: 'query' },
        });
        expect(executeAsyncDocumentCellQuery).toHaveBeenCalledWith({
            account: request.account,
            projectUuid: 'project',
            reference: {
                documentUuid: 'document',
                cellIndex: 0,
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
                controller.executeCellQuery(request, 'project', 'document', 0, {
                    versionUuid: 'version',
                }),
            ).rejects.toThrow(ParameterError);
            expect(executeAsyncDocumentCellQuery).not.toHaveBeenCalled();
        },
    );
});

describe('Document pin boundary', () => {
    test('passes project and slug to the authorized pinning service', async () => {
        const result = {
            projectUuid: 'project',
            spaceUuid: 'space',
            pinnedListUuid: 'list',
            isPinned: true,
        };
        const toggleDocumentPin = vi.fn().mockResolvedValue(result);
        const controller = new DocumentController({
            getPinningService: () => ({ toggleDocumentPin }),
        } as unknown as ConstructorParameters<typeof DocumentController>[0]);
        const request = {
            account: { user: { type: 'registered' } },
        } as unknown as express.Request;
        await expect(
            controller.togglePin(request, 'project', 'weekly-review'),
        ).resolves.toEqual({ status: 'ok', results: result });
        expect(toggleDocumentPin).toHaveBeenCalledWith(
            request.account,
            'project',
            'weekly-review',
        );
    });
});
