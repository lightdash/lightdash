import express from 'express';
import { EventEmitter } from 'node:events';
import { QuerySourceController } from './QuerySourceController';

const setup = () => {
    const getSourceQueryStatuses = vi.fn();
    const controller = new QuerySourceController({
        getQuerySourceService: () => ({ getSourceQueryStatuses }),
    } as unknown as ConstructorParameters<typeof QuerySourceController>[0]);
    const response = new EventEmitter();
    const request = Object.assign(new EventEmitter(), {
        account: {},
        res: response,
    });
    return { controller, getSourceQueryStatuses, response, request };
};

describe('composer status request lifecycle', () => {
    it.each(['aborted', 'close'])(
        'aborts on %s and removes listeners',
        async (event) => {
            const { controller, getSourceQueryStatuses, response, request } =
                setup();
            getSourceQueryStatuses.mockImplementation(
                async (_account, _projectUuid, _queryUuids, { signal }) =>
                    new Promise((resolve) => {
                        signal.addEventListener(
                            'abort',
                            () => resolve({ statuses: [] }),
                            { once: true },
                        );
                    }),
            );
            const result = controller.getSourceQueryStatus(
                'project',
                ['query'],
                request as unknown as express.Request,
                10000,
            );
            (event === 'close' ? response : request).emit(event);
            await expect(result).resolves.toEqual({
                status: 'ok',
                results: { statuses: [] },
            });
            expect(request.listenerCount('aborted')).toBe(0);
            expect(response.listenerCount('close')).toBe(0);
        },
    );

    it.each([false, true])(
        'cleans up after service failure=%s',
        async (fails) => {
            const { controller, getSourceQueryStatuses, response, request } =
                setup();
            if (fails)
                getSourceQueryStatuses.mockRejectedValue(new Error('failure'));
            else getSourceQueryStatuses.mockResolvedValue({ statuses: [] });
            const result = controller.getSourceQueryStatus(
                'project',
                ['query'],
                request as unknown as express.Request,
                100,
            );
            if (fails) await expect(result).rejects.toThrow('failure');
            else
                await expect(result).resolves.toEqual({
                    status: 'ok',
                    results: { statuses: [] },
                });
            expect(request.listenerCount('aborted')).toBe(0);
            expect(response.listenerCount('close')).toBe(0);
        },
    );
});
