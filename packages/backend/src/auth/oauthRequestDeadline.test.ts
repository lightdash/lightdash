import { createServer, Agent as HttpAgent, type Server } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { type AddressInfo } from 'node:net';
import { lightdashConfig } from '../config/lightdashConfig';
import {
    createDatabase,
    deferred,
} from '../models/RefreshTokenRotation/fakeKnex.mock';
import { RefreshTokenRotation } from '../models/RefreshTokenRotation/RefreshTokenRotation';
import { snowflakeAgentClientMock } from '../services/AiAccessService/SnowflakeAgentClientResolver.mock';
import { UserService } from '../services/UserService';
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
