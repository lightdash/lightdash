import OAuth2Server from '@node-oauth/oauth2-server';
import express from 'express';
import { once } from 'node:events';
import { request } from 'node:http';
import { type AddressInfo } from 'node:net';
import { defaultSessionUser } from '../auth/account/account.mock';
import { InvalidTargetError } from '../auth/oauthScopes/oauthResources';
import { FeatureFlagModel } from '../models/FeatureFlagModel/FeatureFlagModel';
import oauthRouter from './oauthRouter';

const clients = [
    {
        name: 'cli',
        id: 'lightdash-cli',
        redirect: 'http://localhost:32123/callback',
        resource: 'https://instance.example/subpath',
        scope: 'read write',
    },
    {
        name: 'other',
        id: 'another-client',
        redirect: 'https://client.example/callback',
        resource: 'https://instance.example/subpath',
        scope: 'read',
    },
    {
        name: 'mcp',
        id: 'mcp-client',
        redirect: 'https://mcp.example/callback',
        resource: 'https://instance.example/subpath/api/v1/mcp',
        scope: 'mcp:read mcp:write',
    },
];
const paths = [
    'signed-out',
    'consent',
    'approve',
    'deny',
    'invalid-redirect',
    'invalid-resource',
    'token-success',
    'token-error',
] as const;

it.each(clients)(
    'pins the complete ordinary $name HTTP responses',
    async (client) => {
        const flag = vi
            .spyOn(FeatureFlagModel.prototype, 'get')
            .mockResolvedValue({ enabled: false } as never);
        const approvalService = vi.fn(() => ({
            isEnabledForUser: async () =>
                (await flag({ featureFlagId: 'agent-identity' })).enabled,
        }));
        const oauth = {
            getSiteUrl: () => 'https://instance.example/subpath',
            isSecurityStrict: vi.fn().mockResolvedValue(true),
            getClientDisplayName: vi.fn().mockResolvedValue(client.name),
            validateRedirectUri: vi
                .fn()
                .mockImplementation(
                    async (_id, redirect) => redirect === client.redirect,
                ),
            getAuthorizationResource: vi
                .fn()
                .mockImplementation(async (req) => {
                    if (req.query.resource === 'https://untrusted.example')
                        throw new InvalidTargetError();
                    return client.resource;
                }),
            authorize: vi
                .fn()
                .mockResolvedValue({ authorizationCode: 'ordinary-code' }),
            token: vi.fn().mockImplementation(async (req) => {
                if (req.body.code === 'invalid')
                    throw new OAuth2Server.InvalidGrantError(
                        'Invalid authorization code',
                    );
                return {
                    accessToken: 'ordinary-access',
                    refreshToken: 'ordinary-refresh',
                    scope: client.scope.split(' '),
                    accessTokenExpiresAt: new Date('2026-10-12T13:00:00Z'),
                };
            }),
        };
        vi.spyOn(Date, 'now').mockReturnValue(
            new Date('2026-10-12T12:00:00Z').getTime(),
        );
        const app = express();
        app.use(express.json());
        app.use((req, res, next) => {
            res.set('Date', 'Mon, 12 Oct 2026 12:00:00 GMT');
            if (req.headers['x-signed-out'] !== 'true')
                req.user = defaultSessionUser;
            req.services = {
                getOauthService: () => oauth,
                getAiAccessService: () => ({
                    getAgentConnectPrompt: async () => ({ required: false }),
                }),
                getAgentConnectionApprovalService: approvalService,
                getFeatureFlagService: () => ({ get: flag }),
            } as never;
            next();
        });
        app.use('/api/v1/oauth', oauthRouter);
        const server = app.listen(0, '127.0.0.1');
        await once(server, 'listening');
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const captured: Record<string, unknown> = {};
        try {
            await (['baseline', 'flag-on', 'flag-off-unknown'] as const).reduce(
                async (previous, variant) => {
                    await previous;
                    flag.mockClear();
                    approvalService.mockClear();
                    flag.mockResolvedValue({
                        enabled: variant === 'flag-on',
                    } as never);
                    const compared: Record<string, unknown> = {};
                    await Promise.all(
                        paths.map(async (scenario) => {
                            const params = {
                                client_id: client.id,
                                redirect_uri:
                                    scenario === 'invalid-redirect'
                                        ? 'https://untrusted.example/callback'
                                        : client.redirect,
                                response_type: 'code',
                                resource:
                                    scenario === 'invalid-resource'
                                        ? 'https://untrusted.example'
                                        : client.resource,
                                ...(variant === 'flag-off-unknown'
                                    ? { agent_request: 'unknown-request' }
                                    : {}),
                                scope: client.scope,
                                state: 'ordinary-state',
                                code_challenge: 'c'.repeat(43),
                                code_challenge_method: 'S256',
                            };
                            const post = [
                                'approve',
                                'deny',
                                'token-success',
                                'token-error',
                            ].includes(scenario);
                            const token = scenario.startsWith('token-');
                            const response = await new Promise<{
                                status: number;
                                headers: unknown;
                                body: string;
                            }>((resolve, reject) => {
                                const call = request(
                                    `${base}/api/v1/oauth/${token ? 'token' : 'authorize'}${post ? '' : `?${new URLSearchParams(params)}`}`,
                                    {
                                        method: post ? 'POST' : 'GET',
                                        headers: {
                                            'content-type': 'application/json',
                                            'x-signed-out': String(
                                                scenario === 'signed-out',
                                            ),
                                            connection: 'close',
                                        },
                                    },
                                    (res) => {
                                        const chunks: Buffer[] = [];
                                        res.on('data', (chunk: Buffer) =>
                                            chunks.push(chunk),
                                        );
                                        res.on('end', () =>
                                            resolve({
                                                status: res.statusCode!,
                                                headers: res.headers,
                                                body: Buffer.concat(
                                                    chunks,
                                                ).toString(),
                                            }),
                                        );
                                    },
                                );
                                call.on('error', reject);
                                call.end(
                                    post
                                        ? JSON.stringify(
                                              token
                                                  ? {
                                                        client_id: client.id,
                                                        resource:
                                                            client.resource,
                                                        grant_type:
                                                            'authorization_code',
                                                        code:
                                                            scenario ===
                                                            'token-error'
                                                                ? 'invalid'
                                                                : 'ordinary-code',
                                                        ...(variant ===
                                                        'flag-off-unknown'
                                                            ? {
                                                                  agent_request:
                                                                      'unknown-request',
                                                              }
                                                            : {}),
                                                    }
                                                  : {
                                                        ...params,
                                                        approve: String(
                                                            scenario !== 'deny',
                                                        ),
                                                    },
                                          )
                                        : undefined,
                                );
                            });
                            compared[scenario] = response;
                        }),
                    );
                    if (variant === 'baseline') {
                        Object.assign(captured, compared);
                        expect(captured).toMatchSnapshot();
                    } else expect(compared).toEqual(captured);
                    if (variant !== 'flag-off-unknown') {
                        expect(flag).not.toHaveBeenCalled();
                        expect(approvalService).not.toHaveBeenCalled();
                    }
                },
                Promise.resolve(),
            );
            expect(oauth.authorize).toHaveBeenCalledTimes(3);
            expect(oauth.token).toHaveBeenCalledTimes(6);
        } finally {
            await new Promise<void>((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
            vi.restoreAllMocks();
        }
    },
);
