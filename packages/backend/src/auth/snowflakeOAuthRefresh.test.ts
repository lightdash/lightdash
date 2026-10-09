import refresh from 'passport-oauth2-refresh';
import {
    classifySnowflakeRefreshError,
    exchangeSnowflakeRefreshToken,
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
            strategyName: 'snowflake-ai',
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
            'snowflake-ai',
            'original',
            expect.any(Function),
        );
    });
});
