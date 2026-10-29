import express, { type Request } from 'express';
import { request as httpRequest } from 'http';
import type { AddressInfo } from 'net';
import passport from 'passport';
import { HeaderAPIKeyStrategy } from 'passport-headerapikey';
import { fromSession } from '../auth/account/account';
import { defaultSessionUser } from '../auth/account/account.mock';
import { lightdashConfig } from '../config/lightdashConfig';
import mcpRouter from './mcpRouter';

it.each(['ApiKey ldpat_test', 'Bearer ldpat_test'])(
    'authenticates %s as a PAT despite an existing browser session',
    async (authorization) => {
        const patEnabled = lightdashConfig.auth.pat.enabled;
        lightdashConfig.auth.pat.enabled = true;
        const validateToken = vi.fn(
            (
                token: string,
                done: (error: Error | null, user: Express.User | false) => void,
            ) =>
                done(null, token === 'ldpat_test' ? defaultSessionUser : false),
        );
        passport.use(
            'headerapikey',
            new HeaderAPIKeyStrategy(
                { header: 'Authorization', prefix: 'ApiKey ' },
                false,
                validateToken,
            ),
        );
        const canAccessMcp = vi.fn();
        const app = express();
        app.use(passport.initialize());
        app.use((req, _res, next) => {
            req.user = defaultSessionUser;
            req.account = fromSession(defaultSessionUser);
            req.services = {
                getOauthService: () => ({
                    authenticate: async () => {
                        throw new Error('Not an OAuth token');
                    },
                    getSiteUrl: () => 'https://example.com',
                }),
                getMcpService: () => ({
                    canAccessMcp,
                    isEnabled: async () => true,
                }),
            } as unknown as Request['services'];
            next();
        });
        app.use('/mcp', mcpRouter);
        const server = app.listen(0, '127.0.0.1');
        await new Promise<void>((resolve) => {
            server.once('listening', resolve);
        });
        try {
            const status = await new Promise<number>((resolve, reject) => {
                const request = httpRequest(
                    {
                        hostname: '127.0.0.1',
                        port: (server.address() as AddressInfo).port,
                        path: '/mcp',
                        method: 'GET',
                        headers: {
                            Authorization: authorization,
                            Cookie: 'connect.sid=session-cookie',
                        },
                    },
                    (response) => {
                        response.once('data', () => {
                            resolve(response.statusCode ?? 0);
                            response.destroy();
                        });
                    },
                );
                request.on('error', reject);
                request.end();
            });
            expect(status).toBe(200);
            expect(validateToken).toHaveBeenCalledWith(
                'ldpat_test',
                expect.any(Function),
            );
            expect(canAccessMcp).toHaveBeenCalledWith(
                expect.objectContaining({
                    authentication: {
                        type: 'pat',
                        source: 'ApiKey ldpat_test',
                    },
                }),
            );
        } finally {
            lightdashConfig.auth.pat.enabled = patEnabled;
            passport.unuse('headerapikey');
            server.closeAllConnections();
            await new Promise<void>((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
        }
    },
);
