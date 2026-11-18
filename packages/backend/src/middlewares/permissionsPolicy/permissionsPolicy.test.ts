import { FeatureFlags } from '@lightdash/common';
import express from 'express';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { get as httpGet, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    createSpaIndexHandler,
    permissionsPolicyHeader,
    setDefaultPermissionsPolicy,
} from './permissionsPolicy';

const BLOCKED = 'camera=(), microphone=()';
const ALLOWED = 'camera=(), microphone=(self)';

const signedInUser = {
    userUuid: 'user-1',
    organizationUuid: 'org-1',
} as Express.User;

type FlagLookup = (args: {
    user?: { userUuid?: string; organizationUuid: string };
    featureFlagId: string;
}) => Promise<{ id: string; enabled: boolean }>;

/**
 * The app's middleware order in miniature: the default policy for every
 * response, the session (here a fixed user), an API route, then the page.
 */
const startServer = async ({
    user,
    getFlag,
}: {
    user: Express.User | undefined;
    getFlag: FlagLookup;
}) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'spa-index-'));
    const indexPath = path.join(dir, 'index.html');
    writeFileSync(indexPath, '<!doctype html><title>Lightdash</title>');
    const featureFlagModel = { get: vi.fn(getFlag) };

    const app = express();
    app.use(setDefaultPermissionsPolicy);
    app.use((req, _res, next) => {
        req.user = user;
        next();
    });
    app.get('/api/v1/health', (_req, res) => {
        res.json({ status: 'ok' });
    });
    const serveSpaIndex = createSpaIndexHandler({
        indexPath,
        featureFlagModel: featureFlagModel as never,
    });
    app.get('/', serveSpaIndex);
    app.get('*', serveSpaIndex);

    const server: Server = await new Promise((resolve) => {
        const listening = app.listen(0, () => {
            resolve(listening);
        });
    });
    const { port } = server.address() as AddressInfo;
    // A real request: unit tests stub the global fetch.
    const get = (url: string) =>
        new Promise<{
            status: number;
            header: (name: string) => string | undefined;
            body: string;
        }>((resolve, reject) => {
            httpGet(`http://127.0.0.1:${port}${url}`, (response) => {
                let body = '';
                response.setEncoding('utf8');
                response.on('data', (chunk: string) => {
                    body += chunk;
                });
                response.on('end', () =>
                    resolve({
                        status: response.statusCode ?? 0,
                        header: (name) => {
                            const value = response.headers[name];
                            return Array.isArray(value)
                                ? value.join(', ')
                                : value;
                        },
                        body,
                    }),
                );
            }).on('error', reject);
        });
    return {
        get,
        featureFlagModel,
        close: () =>
            new Promise<void>((resolve) => {
                server.close(() => resolve());
            }),
    };
};

const flagsOn =
    (on: string[]): FlagLookup =>
    async ({ featureFlagId }) => ({
        id: featureFlagId,
        enabled: on.includes(featureFlagId),
    });

describe('permissionsPolicyHeader', () => {
    it('blocks the camera and the microphone by default', () => {
        expect(permissionsPolicyHeader({ microphoneEnabled: false })).toBe(
            BLOCKED,
        );
    });

    it('lets the page itself use the microphone when enabled', () => {
        expect(permissionsPolicyHeader({ microphoneEnabled: true })).toBe(
            ALLOWED,
        );
    });
});

describe('Permissions-Policy on the app page', () => {
    let server: Awaited<ReturnType<typeof startServer>> | null = null;

    afterEach(async () => {
        await server?.close();
        server = null;
    });

    it('allows the microphone on the page when the organisation has Voice Design on', async () => {
        server = await startServer({
            user: signedInUser,
            getFlag: flagsOn([FeatureFlags.DataAppCapture]),
        });

        const pages = ['/', '/projects/p1/dashboards/d1/view'];
        const responses = await Promise.all(pages.map(server.get));
        responses.forEach((response) => {
            expect(response.status).toBe(200);
            expect(response.header('permissions-policy')).toBe(ALLOWED);
            expect(response.header('cache-control')).toBe('no-cache, private');
        });
        expect(server.featureFlagModel.get).toHaveBeenCalledWith({
            user: { userUuid: 'user-1', organizationUuid: 'org-1' },
            featureFlagId: FeatureFlags.DataAppCapture,
        });
    });

    it('keeps the microphone blocked on API responses, whatever the flag', async () => {
        server = await startServer({
            user: signedInUser,
            getFlag: flagsOn([FeatureFlags.DataAppCapture]),
        });

        const response = await server.get('/api/v1/health');
        expect(response.header('permissions-policy')).toBe(BLOCKED);
    });

    it('keeps the microphone blocked when the flag is off', async () => {
        server = await startServer({
            user: signedInUser,
            getFlag: flagsOn([]),
        });

        const response = await server.get('/');
        expect(response.header('permissions-policy')).toBe(BLOCKED);
    });

    it('keeps the microphone blocked for a signed-out page load, without a flag lookup', async () => {
        server = await startServer({
            user: undefined,
            getFlag: flagsOn([FeatureFlags.DataAppCapture]),
        });

        const response = await server.get('/login');
        expect(response.header('permissions-policy')).toBe(BLOCKED);
        expect(server.featureFlagModel.get).not.toHaveBeenCalled();
    });

    it('still serves the page, with the microphone blocked, when the flag lookup fails', async () => {
        server = await startServer({
            user: signedInUser,
            getFlag: async () => {
                throw new Error('database unavailable');
            },
        });

        const response = await server.get('/');
        expect(response.status).toBe(200);
        expect(response.body).toContain('<title>Lightdash</title>');
        expect(response.header('permissions-policy')).toBe(BLOCKED);
    });
});
