import express from 'express';
import expressSession, { MemoryStore, Store } from 'express-session';
import http, { Server } from 'http';
import { AddressInfo } from 'net';
import { LightdashSecrets } from './config/parseConfig';
import { buildExpressSessionOptions } from './expressSessionOptions';

const OLD_SECRET = 'old secret';
const NEW_SECRET = 'new secret';

const keyring = (active: string, fallbacks: string[]): LightdashSecrets =>
    Object.freeze({
        active,
        fallbacks: Object.freeze([...fallbacks]),
        all: Object.freeze([active, ...fallbacks]),
    });

const preRotation = keyring(OLD_SECRET, []);
const overlap = keyring(NEW_SECRET, [OLD_SECRET]);
const postRemoval = keyring(NEW_SECRET, []);

const buildApp = (secrets: LightdashSecrets, store: Store) => {
    const app = express();
    app.use(
        expressSession(
            buildExpressSessionOptions(
                {
                    lightdashSecrets: secrets,
                    trustProxy: false,
                    cookiesMaxAgeHours: 1,
                    secureCookies: false,
                    cookieSameSite: 'lax',
                },
                store,
                8080,
            ),
        ),
    );
    app.get('/login', (req, res) => {
        req.session.oauth = { returnTo: 'logged-in' };
        res.json({ status: 'ok' });
    });
    app.get('/whoami', (req, res) => {
        res.json({ returnTo: req.session.oauth?.returnTo ?? null });
    });
    return app;
};

type RunningServer = { url: string; close: () => Promise<void> };

const startServer = async (app: express.Express): Promise<RunningServer> => {
    const server: Server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => {
        server.once('listening', resolve);
    });
    const { port } = server.address() as AddressInfo;
    return {
        url: `http://127.0.0.1:${port}`,
        close: () =>
            new Promise<void>((resolve, reject) => {
                server.close((err) => (err ? reject(err) : resolve()));
            }),
    };
};

type HttpResult = { body: string; setCookie: string | undefined };

// Plain node:http because the vitest setup stubs global fetch
const httpGet = (url: string, cookie?: string): Promise<HttpResult> =>
    new Promise((resolve, reject) => {
        const request = http.get(
            url,
            { headers: cookie ? { cookie } : {} },
            (response) => {
                let body = '';
                response.on('data', (chunk) => {
                    body += chunk;
                });
                response.on('end', () => {
                    resolve({
                        body,
                        setCookie:
                            response.headers['set-cookie']?.[0]?.split(';')[0],
                    });
                });
            },
        );
        request.on('error', reject);
    });

const login = async (server: RunningServer): Promise<string> => {
    const { setCookie } = await httpGet(`${server.url}/login`);
    if (!setCookie) {
        throw new Error('expected a session cookie to be set');
    }
    return setCookie;
};

const whoami = async (server: RunningServer, cookie: string) => {
    const { body, setCookie } = await httpGet(`${server.url}/whoami`, cookie);
    return {
        body: JSON.parse(body) as { returnTo: string | null },
        reSignedCookie: setCookie,
    };
};

describe('session cookies across secret rotation keyrings', () => {
    let store: Store;
    let servers: RunningServer[];

    const serve = async (secrets: LightdashSecrets) => {
        const server = await startServer(buildApp(secrets, store));
        servers.push(server);
        return server;
    };

    beforeEach(() => {
        store = new MemoryStore();
        servers = [];
    });

    afterEach(async () => {
        await Promise.all(servers.map((server) => server.close()));
    });

    test('a pre-rotation cookie stays valid while the old secret is a fallback', async () => {
        const oldApp = await serve(preRotation);
        const overlapApp = await serve(overlap);

        const cookie = await login(oldApp);
        const { body } = await whoami(overlapApp, cookie);

        expect(body.returnTo).toEqual('logged-in');
    });

    test('overlap-era cookies are signed with the active secret, not the fallback', async () => {
        const overlapApp = await serve(overlap);
        const newOnlyApp = await serve(postRemoval);
        const oldOnlyApp = await serve(preRotation);

        const cookie = await login(overlapApp);

        // Valid where only the new secret is configured...
        const { body: withNewSecret } = await whoami(newOnlyApp, cookie);
        expect(withNewSecret.returnTo).toEqual('logged-in');

        // ...and invalid where only the old secret is configured
        const { body: withOldSecret } = await whoami(oldOnlyApp, cookie);
        expect(withOldSecret.returnTo).toBeNull();
    });

    test('touching a pre-rotation session re-signs its cookie with the active secret', async () => {
        const oldApp = await serve(preRotation);
        const overlapApp = await serve(overlap);
        const newOnlyApp = await serve(postRemoval);

        const oldCookie = await login(oldApp);
        const { reSignedCookie } = await whoami(overlapApp, oldCookie);

        expect(reSignedCookie).toBeDefined();
        const { body } = await whoami(newOnlyApp, reSignedCookie!);
        expect(body.returnTo).toEqual('logged-in');
    });

    test('removing the old secret invalidates cookies still signed with it', async () => {
        const oldApp = await serve(preRotation);
        const newOnlyApp = await serve(postRemoval);

        const cookie = await login(oldApp);
        const { body } = await whoami(newOnlyApp, cookie);

        expect(body.returnTo).toBeNull();
    });

    test('a tampered signature is rejected in every keyring', async () => {
        const overlapApp = await serve(overlap);

        const cookie = await login(overlapApp);
        const tampered = cookie.endsWith('0')
            ? `${cookie.slice(0, -1)}1`
            : `${cookie.slice(0, -1)}0`;
        const { body } = await whoami(overlapApp, tampered);

        expect(body.returnTo).toBeNull();
    });
});
