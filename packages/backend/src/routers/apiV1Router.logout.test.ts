import express from 'express';
import { once } from 'node:events';
import { request } from 'node:http';
import { type AddressInfo } from 'node:net';
import { apiV1Router } from './apiV1Router';

const get = (url: string): Promise<number> =>
    new Promise((resolve, reject) => {
        const req = request(url, { method: 'GET' }, (res) => {
            res.resume();
            res.on('end', () => resolve(res.statusCode ?? 0));
        });
        req.on('error', reject);
        req.end();
    });

const startApp = async (
    deleteUnredeemedForUser: (userUuid: string) => Promise<void>,
) => {
    const app = express();
    app.use((req, _res, next) => {
        req.user = {
            userUuid: 'user-0000-test',
            organizationUuid: 'org-0000-test',
        } as never;
        req.logout = ((callback: (error?: unknown) => void) =>
            callback()) as never;
        req.session = {
            destroy: (callback: (error?: unknown) => void) => callback(),
        } as never;
        req.services = {
            getMobileSignInService: () => ({ deleteUnredeemedForUser }),
        } as never;
        next();
    });
    app.use('/api/v1', apiV1Router);
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return {
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/logout`,
        close: () => server.close(),
    };
};

describe('GET /api/v1/logout', () => {
    it('deletes the user unredeemed mobile sign-in codes before answering', async () => {
        const order: string[] = [];
        const deleteUnredeemedForUser = vi.fn(async () => {
            await new Promise((resolve) => {
                setTimeout(resolve, 20);
            });
            order.push('deleted');
        });
        const { url, close } = await startApp(deleteUnredeemedForUser);
        try {
            expect(await get(url)).toBe(200);
            order.push('answered');
            expect(deleteUnredeemedForUser).toHaveBeenCalledWith(
                'user-0000-test',
            );
            expect(order).toEqual(['deleted', 'answered']);
        } finally {
            close();
        }
    });

    it('still logs out when the cleanup fails', async () => {
        const { url, close } = await startApp(
            vi.fn(async () => {
                throw new Error('db down');
            }),
        );
        try {
            expect(await get(url)).toBe(200);
        } finally {
            close();
        }
    });
});
