import { ApiConnectorType } from '@lightdash/common';
import { parseRetryAfterSeconds, readLiveRateLimit } from './calls';
import { getLiveIntegration } from './registry';
import { type LiveHttpResponse } from './types';

const postHogIntegration = getLiveIntegration(ApiConnectorType.POSTHOG);
const metaAdsIntegration = getLiveIntegration(ApiConnectorType.META_ADS);
const salesforceIntegration = getLiveIntegration(ApiConnectorType.SALESFORCE);

const NOW = new Date('2026-11-22T14:00:00Z');

const response = (
    status: number,
    body: unknown = {},
    headers: Record<string, string> = {},
): LiveHttpResponse => ({ status, body, headers });

describe('readLiveRateLimit', () => {
    const postHog = {
        connector: ApiConnectorType.POSTHOG,
        projectId: '1',
    } as const;

    it('reads a 429 with Retry-After in seconds', () => {
        expect(
            readLiveRateLimit(
                postHogIntegration,
                postHog,
                response(429, {}, { 'retry-after': '4' }),
                NOW,
            ),
        ).toEqual({ resumesAt: new Date('2026-11-22T14:00:04Z') });
    });

    it('reads a 429 without Retry-After as a limit with no resume time', () => {
        expect(
            readLiveRateLimit(postHogIntegration, postHog, response(429), NOW),
        ).toEqual({ resumesAt: null });
    });

    it("reads Meta's throttle code as a rate limit", () => {
        expect(
            readLiveRateLimit(
                metaAdsIntegration,
                { connector: ApiConnectorType.META_ADS, adAccountId: '123' },
                response(400, { error: { code: 17, message: 'User limit' } }),
                NOW,
            ),
        ).toEqual({ resumesAt: null });
    });

    it("reads Salesforce's REQUEST_LIMIT_EXCEEDED on a 403 as a rate limit", () => {
        expect(
            readLiveRateLimit(
                salesforceIntegration,
                { connector: ApiConnectorType.SALESFORCE },
                response(403, [
                    {
                        errorCode: 'REQUEST_LIMIT_EXCEEDED',
                        message: 'TotalRequests Limit exceeded.',
                    },
                ]),
                NOW,
            ),
        ).toEqual({ resumesAt: null });
    });

    it('ignores server errors and successes', () => {
        expect(
            readLiveRateLimit(postHogIntegration, postHog, response(503), NOW),
        ).toBeNull();
        expect(
            readLiveRateLimit(postHogIntegration, postHog, response(200), NOW),
        ).toBeNull();
    });
});

describe('parseRetryAfterSeconds', () => {
    it('reads seconds and HTTP dates', () => {
        expect(parseRetryAfterSeconds('30', NOW)).toBe(30);
        expect(
            parseRetryAfterSeconds('Sun, 22 Nov 2026 14:01:00 GMT', NOW),
        ).toBe(60);
        expect(parseRetryAfterSeconds('soon', NOW)).toBeNull();
        expect(parseRetryAfterSeconds(undefined, NOW)).toBeNull();
    });
});
