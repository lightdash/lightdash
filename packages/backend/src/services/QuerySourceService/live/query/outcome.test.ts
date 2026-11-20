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
    getLiveQueryOutcome,
    getLiveSourceErrorCode,
    getLiveSourceQueryErrorCode,
    isLiveSourceErrorReportable,
    LIVE_QUERY_OUTCOMES,
} from './outcome';

describe('getLiveQueryOutcome', () => {
    it.each([
        [new ParameterError('blocked'), 'invalid_request'],
        [new WarehouseQueryError('bad HogQL'), 'query_error'],
        [new WarehouseConnectionError('bad key'), 'connection_error'],
        [new TooManyRequestsError('budget'), 'rate_limited'],
        [new TimeoutError('slow'), 'timeout'],
        [new UnexpectedServerError('502'), 'upstream_error'],
        [new Error('S3 is not enabled'), 'internal_error'],
    ])('buckets %s as %s', (error, outcome) => {
        expect(getLiveQueryOutcome(error)).toBe(outcome);
    });
});

describe('getLiveSourceQueryErrorCode', () => {
    it("gives every failed outcome a stable code, ours apart from the integration's", () => {
        expect(
            Object.fromEntries(
                LIVE_QUERY_OUTCOMES.map((outcome) => [
                    outcome,
                    getLiveSourceQueryErrorCode(outcome),
                ]),
            ),
        ).toEqual({
            ok: null,
            invalid_request: 'live_source.internal.invalid_request',
            query_error: 'live_source.upstream.invalid_request',
            connection_error: 'live_source.upstream.auth',
            rate_limited: 'live_source.upstream.rate_limited',
            timeout: 'live_source.upstream.timeout',
            upstream_error: 'live_source.upstream.unknown',
            internal_error: 'live_source.internal.error',
        });
    });

    it('reports every failure of ours and the integration rejecting or not understanding', () => {
        expect(
            [
                'live_source.internal.invalid_request',
                'live_source.internal.error',
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
            'live_source.internal.invalid_request',
            'live_source.internal.error',
            'live_source.upstream.invalid_request',
            'live_source.upstream.unknown',
        ]);
    });
});

describe('getLiveSourceErrorCode', () => {
    it('keeps the refusal code an error carries, and never reports it', () => {
        const error = new ParameterError('read too much', {
            liveSourceErrorCode: 'live_source.refused.response_too_large',
            liveSourceErrorCodes: ['live_source.refused.response_too_large'],
        });
        const code = getLiveSourceErrorCode(error, getLiveQueryOutcome(error));
        expect(code).toBe('live_source.refused.response_too_large');
        expect(isLiveSourceErrorReportable(code!)).toBe(false);
    });

    it("falls back to the outcome's code", () => {
        const error = new ParameterError('blocked');
        expect(getLiveSourceErrorCode(error, 'invalid_request')).toBe(
            'live_source.internal.invalid_request',
        );
        expect(
            getLiveSourceErrorCode(
                new ParameterError('odd', { liveSourceErrorCode: 'made_up' }),
                'invalid_request',
            ),
        ).toBe('live_source.internal.invalid_request');
    });
});
