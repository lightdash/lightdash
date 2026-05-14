import {
    getSlackErrorCode,
    isSlackRateLimitedError,
    isUnrecoverableSlackError,
    SLACK_USER_FACING_ERROR_MESSAGES,
    translateSlackError,
} from './slack';

describe('getSlackErrorCode', () => {
    it('returns the error code from a Slack API error shape', () => {
        expect(getSlackErrorCode({ data: { error: 'invalid_blocks' } })).toBe(
            'invalid_blocks',
        );
    });

    it('returns undefined for non-Slack errors', () => {
        expect(getSlackErrorCode(new Error('boom'))).toBeUndefined();
        expect(getSlackErrorCode(undefined)).toBeUndefined();
        expect(getSlackErrorCode(null)).toBeUndefined();
        expect(getSlackErrorCode('string')).toBeUndefined();
        expect(getSlackErrorCode({ data: {} })).toBeUndefined();
    });
});

describe('isUnrecoverableSlackError', () => {
    it('returns true for known unrecoverable codes', () => {
        expect(
            isUnrecoverableSlackError({ data: { error: 'channel_not_found' } }),
        ).toBe(true);
        expect(
            isUnrecoverableSlackError({ data: { error: 'invalid_auth' } }),
        ).toBe(true);
    });

    it('returns false for recoverable or unknown codes', () => {
        expect(
            isUnrecoverableSlackError({ data: { error: 'invalid_blocks' } }),
        ).toBe(false);
        expect(isUnrecoverableSlackError(new Error('boom'))).toBe(false);
    });
});

describe('isSlackRateLimitedError', () => {
    it('returns true for the @slack/web-api rate limit error', () => {
        const error = Object.assign(new Error('rate limited'), {
            code: 'slack_webapi_rate_limited_error',
        });
        expect(isSlackRateLimitedError(error)).toBe(true);
    });

    it('returns false for other errors', () => {
        expect(isSlackRateLimitedError(new Error('boom'))).toBe(false);
        expect(
            isSlackRateLimitedError({ data: { error: 'invalid_blocks' } }),
        ).toBe(false);
    });
});

describe('translateSlackError', () => {
    it.each(Object.entries(SLACK_USER_FACING_ERROR_MESSAGES))(
        'translates %s to its user-facing message',
        (slackErrorCode, message) => {
            expect(
                translateSlackError({ data: { error: slackErrorCode } }),
            ).toEqual({
                error: message,
                slackErrorCode,
            });
        },
    );

    it('returns null for unknown Slack error codes', () => {
        expect(
            translateSlackError({ data: { error: 'rate_limited' } }),
        ).toBeNull();
        expect(
            translateSlackError({ data: { error: 'something_new' } }),
        ).toBeNull();
    });

    it('returns null for non-Slack errors', () => {
        expect(translateSlackError(new Error('boom'))).toBeNull();
        expect(translateSlackError(undefined)).toBeNull();
        expect(translateSlackError(null)).toBeNull();
        expect(translateSlackError('invalid_blocks')).toBeNull();
    });
});
