import { LightdashRequestMethodHeader, RequestMethod } from '@lightdash/common';
import express from 'express';
import http from 'http';
import { type AddressInfo } from 'net';
import { helmetForInternalHttpHost } from './internalHttpHost';

const INTERNAL_HOST = 'lightdash.lightdash.svc.cluster.local:8080';
const HEADLESS = {
    [LightdashRequestMethodHeader]: RequestMethod.HEADLESS_BROWSER,
};

const helmetConfig = {
    contentSecurityPolicy: {
        directives: {
            'default-src': ["'self'"],
            'frame-ancestors': ["'self'"],
        },
        reportOnly: false,
    },
};

describe('helmetForInternalHttpHost', () => {
    let server: http.Server;

    const startServer = async (internalLightdashHost: string) => {
        const app = express();
        app.use(helmetForInternalHttpHost(helmetConfig, internalLightdashHost));
        app.use(
            '/embed/*',
            helmetForInternalHttpHost(
                {
                    ...helmetConfig,
                    contentSecurityPolicy: {
                        ...helmetConfig.contentSecurityPolicy,
                        directives: {
                            ...helmetConfig.contentSecurityPolicy.directives,
                            'frame-ancestors': ["'self'", 'https://*'],
                        },
                    },
                },
                internalLightdashHost,
            ),
        );
        app.get('*', (_req, res) => {
            res.send('ok');
        });
        server = await new Promise<http.Server>((resolve) => {
            const listening = app.listen(0, '127.0.0.1', () =>
                resolve(listening),
            );
        });
    };

    const getCsp = (
        path: string,
        headers: Record<string, string>,
    ): Promise<string> =>
        new Promise((resolve, reject) => {
            http.get(
                {
                    host: '127.0.0.1',
                    port: (server.address() as AddressInfo).port,
                    path,
                    headers,
                },
                (res) => {
                    res.resume();
                    resolve(String(res.headers['content-security-policy']));
                },
            ).on('error', reject);
        });

    afterEach(
        () =>
            new Promise<void>((resolve) => {
                server.close(() => resolve());
            }),
    );

    describe('with a plain http internal host', () => {
        beforeEach(() => startServer(`http://${INTERNAL_HOST}`));

        it.each(['/minimal/projects/x/saved/y', '/embed/x'])(
            'omits upgrade-insecure-requests for the headless browser on %s',
            async (path) => {
                const csp = await getCsp(path, {
                    host: INTERNAL_HOST,
                    ...HEADLESS,
                });
                expect(csp).toContain("default-src 'self'");
                expect(csp).not.toContain('upgrade-insecure-requests');
            },
        );

        it('keeps the embed frame-ancestors override', async () => {
            const csp = await getCsp('/embed/x', {
                host: INTERNAL_HOST,
                ...HEADLESS,
            });
            expect(csp).toContain("frame-ancestors 'self' https://*");
        });

        it.each(['/minimal/projects/x/saved/y', '/embed/x'])(
            'keeps the directive on %s when a proxy forwarded an https request',
            async (path) => {
                const csp = await getCsp(path, {
                    host: INTERNAL_HOST,
                    'x-forwarded-proto': 'https',
                    ...HEADLESS,
                });
                expect(csp).toContain('upgrade-insecure-requests');
            },
        );

        it('keeps the directive for a proxy chain that started as https', async () => {
            const csp = await getCsp('/', {
                host: INTERNAL_HOST,
                'x-forwarded-proto': 'https, http',
                ...HEADLESS,
            });
            expect(csp).toContain('upgrade-insecure-requests');
        });

        it('keeps the directive for requests that are not from the headless browser', async () => {
            const csp = await getCsp('/', { host: INTERNAL_HOST });
            expect(csp).toContain('upgrade-insecure-requests');
        });

        it('keeps the directive on other hosts', async () => {
            const csp = await getCsp('/', {
                host: 'analytics.example.com',
                ...HEADLESS,
            });
            expect(csp).toContain('upgrade-insecure-requests');
        });

        it('keeps the directive on another port of the internal host', async () => {
            const csp = await getCsp('/', {
                host: 'lightdash.lightdash.svc.cluster.local:3000',
                ...HEADLESS,
            });
            expect(csp).toContain('upgrade-insecure-requests');
        });
    });

    it('keeps the directive when the internal host is https', async () => {
        await startServer(`https://${INTERNAL_HOST}`);
        const csp = await getCsp('/', { host: INTERNAL_HOST, ...HEADLESS });
        expect(csp).toContain('upgrade-insecure-requests');
    });

    it('keeps the directive when the internal host is not a url', async () => {
        await startServer('not a url');
        const csp = await getCsp('/', { host: INTERNAL_HOST, ...HEADLESS });
        expect(csp).toContain('upgrade-insecure-requests');
    });
});
