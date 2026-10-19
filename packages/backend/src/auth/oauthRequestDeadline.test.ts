import { type Knex } from 'knex';
import fetch, { FetchError } from 'node-fetch';
import { createServer, Agent as HttpAgent, type Server } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { type AddressInfo } from 'node:net';
import { type Duplex } from 'node:stream';
import { lightdashConfig } from '../config/lightdashConfig';
import {
    createDatabase,
    deferred,
} from '../models/RefreshTokenRotation/fakeKnex.mock';
import { RefreshTokenRotation } from '../models/RefreshTokenRotation/RefreshTokenRotation';
import { snowflakeAgentClientMock } from '../services/AiAccessService/SnowflakeAgentClientResolver.mock';
import { UserService } from '../services/UserService';
import {
    exchangeDatabricksOAuthCredentialsWithDeadline,
    refreshDatabricksOAuthTokenWithDeadline,
} from './databricksOAuthRefresh';
import * as deadline from './oauthRequestDeadline';
import {
    createOAuthDeadlineAgent,
    OAuthRequestTimeoutError,
} from './oauthRequestDeadline';
import {
    classifySnowflakeRefreshError,
    exchangeSnowflakeRefreshToken,
} from './snowflakeOAuthRefresh';

let server: Server | undefined;
const originalSnowflakeConfig = lightdashConfig.auth.snowflake;
afterEach(async () => {
    vi.restoreAllMocks();
    lightdashConfig.auth.snowflake = originalSnowflakeConfig;
    if (server) {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => {
            server!.close((error) => (error ? reject(error) : resolve()));
        });
        server = undefined;
    }
});

test('matches the endpoint protocol and classifies timeout errors as temporary', () => {
    const httpAgent = createOAuthDeadlineAgent('http://localhost/token');
    const httpsAgent = createOAuthDeadlineAgent('https://localhost/token');
    expect(httpAgent).toBeInstanceOf(HttpAgent);
    expect(httpAgent).not.toBeInstanceOf(HttpsAgent);
    expect(httpsAgent).toBeInstanceOf(HttpsAgent);
    expect(
        classifySnowflakeRefreshError(new OAuthRequestTimeoutError()),
    ).toEqual({ kind: 'temporary' });
    httpAgent.destroy();
    httpsAgent.destroy();
});

test.each(['personal', 'agent'] as const)(
    '%s transport cancels a stalled request before releasing the lock and admission',
    async (kind) => {
        const accepted = deferred<void>();
        const disconnected = deferred<void>();
        server = createServer((request) => {
            request.resume();
            request.socket.on('close', () => disconnected.resolve());
            accepted.resolve();
        });
        await new Promise<void>((resolve) => {
            server!.listen(0, '127.0.0.1', resolve);
        });
        const tokenEndpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/token`;
        lightdashConfig.auth.snowflake = {
            ...lightdashConfig.auth.snowflake,
            clientId: 'client',
            clientSecret: 'secret',
            authorizationEndpoint: tokenEndpoint,
            tokenEndpoint,
        };
        const { database, transaction } = createDatabase();
        const coordinator = new RefreshTokenRotation({
            database,
            maxConcurrent: 1,
            admissionTimeoutMs: 1000,
        });
        const exchange = vi.fn((refreshToken: string) =>
            kind === 'personal'
                ? UserService.generateSnowflakeAccessToken(refreshToken, 50)
                : exchangeSnowflakeRefreshToken({
                      client: { ...snowflakeAgentClientMock, tokenEndpoint },
                      refreshToken,
                      now: new Date(),
                      requestTimeoutMs: 50,
                  }),
        );
        const run = {
            key: { kind: 'project' as const, uuid: 'row', purpose: null },
            shareKey: kind,
            readCurrentRefreshToken: vi.fn().mockResolvedValue('refresh'),
            exchange,
            persist: vi.fn().mockResolvedValue(undefined),
        };
        const first = coordinator.run(run);
        const firstError = first.catch((error: unknown) => error);
        await accepted.promise;
        const follower = coordinator.run(run);
        const followerError = follower.catch((error: unknown) => error);
        expect(follower).toBe(first);
        const next = coordinator.run({
            ...run,
            key: { ...run.key, uuid: 'other' },
            persist: vi.fn().mockResolvedValue(undefined),
            exchange: async () => ({
                accessToken: 'next',
                refreshToken: 'refresh',
            }),
        });
        expect(transaction).toHaveBeenCalledTimes(1);
        const error = await firstError;
        expect(error).toBeInstanceOf(OAuthRequestTimeoutError);
        expect(await followerError).toBe(error);
        await disconnected.promise;
        expect(run.persist).not.toHaveBeenCalled();
        await expect(next).resolves.toMatchObject({
            result: { accessToken: 'next' },
        });
        await expect(
            coordinator.run({
                ...run,
                exchange: async () => ({
                    accessToken: 'retry',
                    refreshToken: 'refresh',
                }),
            }),
        ).resolves.toMatchObject({ result: { accessToken: 'retry' } });
        expect(exchange).toHaveBeenCalledTimes(1);
        expect(transaction).toHaveBeenCalledTimes(3);
    },
);

vi.mock('node-fetch', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node-fetch')>();
    return { ...actual, default: vi.fn(actual.default) };
});

describe.each(['exchange', 'refresh'] as const)(
    'Databricks %s transport',
    (mode) => {
        test.each(['headers', 'body', 'error-body'] as const)(
            'cancels stalled %s and destroys its socket before releasing the lock',
            async (stall) => {
                const accepted = deferred<void>();
                const disconnected = deferred<void>();
                server = createServer((request, response) => {
                    request.resume();
                    request.socket.on('close', () => disconnected.resolve());
                    if (stall !== 'headers') {
                        response.writeHead(stall === 'error-body' ? 400 : 200, {
                            'Content-Type': 'application/json',
                        });
                        response.write('{');
                    }
                    accepted.resolve();
                });
                await new Promise<void>((resolve) => {
                    server!.listen(0, '127.0.0.1', resolve);
                });
                const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/oidc/v1/token`;
                const actualFetch = (
                    await vi.importActual<typeof import('node-fetch')>(
                        'node-fetch',
                    )
                ).default;
                const fetchErrors: unknown[] = [];
                vi.mocked(fetch).mockImplementation(async (_url, options) => {
                    try {
                        const response = await actualFetch(endpoint, options);
                        const { body } = response;
                        body.on('error', (error: unknown) =>
                            fetchErrors.push(error),
                        );
                        return response;
                    } catch (error) {
                        fetchErrors.push(error);
                        throw error;
                    }
                });
                const agent = createOAuthDeadlineAgent(endpoint, 50);
                const destroy = vi.spyOn(agent, 'destroy');
                const sockets: Duplex[] = [];
                const createConnection = agent.createConnection.bind(agent);
                vi.spyOn(agent, 'createConnection').mockImplementation(
                    (options) => {
                        const socket = createConnection(options)!;
                        sockets.push(socket);
                        return socket;
                    },
                );
                vi.spyOn(deadline, 'createOAuthDeadlineAgent').mockReturnValue(
                    agent,
                );
                const { database, transaction, raw } = createDatabase();
                const released = vi.fn(() => {
                    expect(destroy).toHaveBeenCalledTimes(1);
                    expect(sockets).toHaveLength(1);
                    expect(sockets[0].destroyed).toBe(true);
                });
                transaction.mockImplementation(async (callback) => {
                    try {
                        return await callback({
                            raw,
                        } as unknown as Knex.Transaction);
                    } finally {
                        released();
                    }
                });
                const coordinator = new RefreshTokenRotation({
                    database,
                    maxConcurrent: 1,
                });
                const persist = vi.fn();
                const run = {
                    key: {
                        kind: 'project' as const,
                        uuid: 'databricks-row',
                        purpose: null,
                    },
                    shareKey: mode,
                    readCurrentRefreshToken: vi
                        .fn()
                        .mockResolvedValue('refresh'),
                    exchange: () =>
                        mode === 'exchange'
                            ? exchangeDatabricksOAuthCredentialsWithDeadline(
                                  'workspace.test',
                                  'client',
                                  'secret',
                                  50,
                              )
                            : refreshDatabricksOAuthTokenWithDeadline(
                                  'workspace.test',
                                  'client',
                                  'refresh',
                                  'secret',
                                  50,
                              ),
                    persist,
                };
                const first = coordinator.run(run);
                const firstError = first.catch((error: unknown) => error);
                await accepted.promise;
                const follower = coordinator.run(run);
                expect(follower).toBe(first);
                const error = await firstError;
                expect(error).toBeInstanceOf(OAuthRequestTimeoutError);
                expect(error).toHaveProperty(
                    'code',
                    'WAREHOUSE_OAUTH_REQUEST_TIMEOUT',
                );
                if (stall === 'headers') {
                    expect(fetchErrors[0]).toBeInstanceOf(FetchError);
                    expect(fetchErrors[0]).toHaveProperty(
                        'code',
                        'WAREHOUSE_OAUTH_REQUEST_TIMEOUT',
                    );
                }
                await disconnected.promise;
                expect(released).toHaveBeenCalledTimes(1);
                expect(persist).not.toHaveBeenCalled();
                expect(fetch).toHaveBeenCalledWith(
                    'https://workspace.test/oidc/v1/token',
                    expect.objectContaining({
                        agent,
                        method: 'POST',
                        body:
                            mode === 'exchange'
                                ? 'grant_type=client_credentials&client_id=client&client_secret=secret&scope=sql'
                                : 'grant_type=refresh_token&refresh_token=refresh&client_id=client&client_secret=secret',
                    }),
                );
                await expect(
                    coordinator.run({
                        ...run,
                        exchange: async () => ({
                            accessToken: 'retry',
                            refreshToken: 'refresh',
                        }),
                    }),
                ).resolves.toMatchObject({ result: { accessToken: 'retry' } });
            },
        );
    },
);
