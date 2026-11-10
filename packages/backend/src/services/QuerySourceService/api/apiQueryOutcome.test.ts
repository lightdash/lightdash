import {
    ParameterError,
    TimeoutError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    API_QUERY_OUTCOMES,
    getApiQueryOutcome,
    getLiveSourceUpstreamErrorCode,
    isLiveSourceErrorReportable,
} from './apiQueryOutcome';

describe('getApiQueryOutcome', () => {
    it.each([
        [new ParameterError('blocked'), 'invalid_request'],
        [new WarehouseQueryError('bad HogQL'), 'query_error'],
        [new WarehouseConnectionError('bad key'), 'connection_error'],
        [new TooManyRequestsError('budget'), 'rate_limited'],
        [new TimeoutError('slow'), 'timeout'],
        [new UnexpectedServerError('502'), 'upstream_error'],
        [new Error('S3 is not enabled'), 'internal_error'],
    ])('buckets %s as %s', (error, outcome) => {
        expect(getApiQueryOutcome(error)).toBe(outcome);
    });
});

describe('getLiveSourceUpstreamErrorCode', () => {
    it('gives every failed outcome a stable code', () => {
        expect(
            Object.fromEntries(
                API_QUERY_OUTCOMES.map((outcome) => [
                    outcome,
                    getLiveSourceUpstreamErrorCode(outcome),
                ]),
            ),
        ).toEqual({
            ok: null,
            invalid_request: 'live_source.upstream.invalid_request',
            query_error: 'live_source.upstream.invalid_request',
            connection_error: 'live_source.upstream.auth',
            rate_limited: 'live_source.upstream.rate_limited',
            timeout: 'live_source.upstream.timeout',
            upstream_error: 'live_source.upstream.unknown',
            internal_error: 'live_source.upstream.unknown',
        });
    });

    it('reports only requests we built wrong or errors we do not know', () => {
        expect(
            [
                'live_source.upstream.auth',
                'live_source.upstream.rate_limited',
                'live_source.upstream.invalid_request',
                'live_source.upstream.timeout',
                'live_source.upstream.unknown',
            ].filter((code) =>
                isLiveSourceErrorReportable(
                    code as Parameters<typeof isLiveSourceErrorReportable>[0],
                ),
            ),
        ).toEqual([
            'live_source.upstream.invalid_request',
            'live_source.upstream.unknown',
        ]);
    });
});
