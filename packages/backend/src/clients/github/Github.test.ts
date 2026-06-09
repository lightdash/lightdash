import { isGithubRateLimitError } from './Github';

const octokitError = (
    status: number,
    headers: Record<string, string> = {},
    message = 'Request failed',
): Error =>
    Object.assign(new Error(message), { status, response: { headers } });

describe('isGithubRateLimitError', () => {
    it('detects a primary limit (403 with x-ratelimit-remaining: 0)', () => {
        expect(
            isGithubRateLimitError(
                octokitError(403, { 'x-ratelimit-remaining': '0' }),
            ),
        ).toBe(true);
    });

    it('detects a secondary limit (429)', () => {
        expect(isGithubRateLimitError(octokitError(429))).toBe(true);
    });

    it('detects a secondary limit (403 with retry-after)', () => {
        expect(
            isGithubRateLimitError(octokitError(403, { 'retry-after': '60' })),
        ).toBe(true);
    });

    it('detects a rate limit by message', () => {
        expect(
            isGithubRateLimitError(
                octokitError(
                    403,
                    {},
                    'API rate limit exceeded for installation',
                ),
            ),
        ).toBe(true);
    });

    it('is false for a 404 (missing file)', () => {
        expect(isGithubRateLimitError(octokitError(404, {}, 'Not Found'))).toBe(
            false,
        );
    });

    it('is false for a permission 403 with quota remaining', () => {
        expect(
            isGithubRateLimitError(
                octokitError(
                    403,
                    { 'x-ratelimit-remaining': '4999' },
                    'Resource not accessible by integration',
                ),
            ),
        ).toBe(false);
    });

    it('is false for a generic error / non-octokit value', () => {
        expect(isGithubRateLimitError(new Error('socket hang up'))).toBe(false);
        expect(isGithubRateLimitError(null)).toBe(false);
        expect(isGithubRateLimitError(undefined)).toBe(false);
    });
});
