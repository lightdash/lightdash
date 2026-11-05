import { createServer } from 'node:http';
import { type AddressInfo } from 'node:net';
import { snowflakeAgentClientMock as client } from '../services/AiAccessService/SnowflakeAgentClientResolver.mock';
import {
    classifySnowflakeRefreshError,
    exchangeSnowflakeRefreshToken,
    snowflakeOAuthRefreshClient as refresh,
} from './snowflakeOAuthRefresh';

describe('classifySnowflakeRefreshError', () => {
    test.each([
        [new Error('invalid_grant'), 'temporary'],
        [null, 'temporary'],
        [{ statusCode: 400 }, 'configuration'],
        [{ statusCode: 408, data: '{"error":"invalid_grant"}' }, 'temporary'],
        [{ statusCode: 429, data: '{"error":"invalid_grant"}' }, 'temporary'],
        [{ statusCode: 503, data: '{"error":"invalid_grant"}' }, 'temporary'],
        [{ statusCode: 400, data: '{"error":"invalid_grant"}' }, 'grant_gone'],
        [{ statusCode: 400, data: '{"error":"server_error"}' }, 'temporary'],
        [
            { statusCode: 400, data: '{"error":"temporarily_unavailable"}' },
            'temporary',
        ],
        [
            { statusCode: 401, data: '{"error":"invalid_client"}' },
            'configuration',
        ],
        [
            { statusCode: 400, data: '{"error":"unauthorized_client"}' },
            'configuration',
        ],
        [
            {
                statusCode: 400,
                data: '{"error":"invalid_request","error_description":"invalid_grant"}',
            },
            'configuration',
        ],
        [{ statusCode: 400, data: 'invalid_grant' }, 'configuration'],
        [{ statusCode: 400, data: 'null' }, 'configuration'],
    ])('classifies %s as %s', (error, kind) => {
        expect(classifySnowflakeRefreshError(error)).toEqual({ kind });
    });
});
describe('exchangeSnowflakeRefreshToken', () => {
    afterEach(() => vi.restoreAllMocks());
    test.each([
        600,
        '600',
        null,
        undefined,
        0,
        -1,
        Infinity,
        'bad',
        true,
        '',
        1e30,
    ])('parses expiry %s', async (seconds) => {
        const now = new Date('2026-10-09T12:00:00Z');
        vi.spyOn(refresh, 'requestNewAccessToken').mockImplementation(
            (_strategy, _token, callback) =>
                callback(null, 'access', '', {
                    expires_in: seconds,
                    refresh_token_expires_in: seconds,
                }),
        );
        const result = await exchangeSnowflakeRefreshToken({
            client,
            refreshToken: 'original',
            now,
        });
        expect(result).toEqual({
            accessToken: 'access',
            refreshToken: 'original',
            accessTokenExpiresAt:
                seconds === 600 || seconds === '600'
                    ? new Date(now.getTime() + 600000)
                    : null,
            refreshTokenExpiresAt:
                seconds === 600 || seconds === '600'
                    ? new Date(now.getTime() + 600000)
                    : null,
        });
        expect(refresh.requestNewAccessToken).toHaveBeenCalledWith(
            client,
            'original',
            expect.any(Function),
        );
    });
});

test.each([200, 400])(
    'sends a refresh request to the resolved endpoint (HTTP %s)',
    async (status) => {
        let request:
            | { url: string | undefined; body: URLSearchParams }
            | undefined;
        const server = createServer((req, res) => {
            let body = '';
            req.setEncoding('utf8');
            req.on('data', (chunk: string) => {
                body += chunk;
            });
            req.on('end', () => {
                request = { url: req.url, body: new URLSearchParams(body) };
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(
                    JSON.stringify(
                        status === 200
                            ? {
                                  access_token: 'new-access',
                                  refresh_token: 'new-refresh',
                                  expires_in: 600,
                              }
                            : { error: 'invalid_grant' },
                    ),
                );
            });
        });
        await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', resolve);
        });
        try {
            const tokenEndpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/org-token`;
            const result = exchangeSnowflakeRefreshToken({
                client: {
                    ...client,
                    source: 'organization',
                    clientId: 'org-id',
                    clientSecret: 'org-secret',
                    tokenEndpoint,
                },
                refreshToken: 'saved-refresh',
                now: new Date(),
            });
            if (status === 200)
                await expect(result).resolves.toMatchObject({
                    accessToken: 'new-access',
                    refreshToken: 'new-refresh',
                });
            else
                await expect(result).rejects.toEqual({
                    statusCode: 400,
                    data: '{"error":"invalid_grant"}',
                });
            expect(request?.url).toBe('/org-token');
            expect(Object.fromEntries(request!.body)).toEqual({
                client_id: 'org-id',
                client_secret: 'org-secret',
                grant_type: 'refresh_token',
                refresh_token: 'saved-refresh',
            });
        } finally {
            await new Promise<void>((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
        }
    },
);
