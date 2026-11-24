import {
    getLiveSourceErrorOrigin,
    ParameterError,
    TimeoutError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getLiveQueryFailure,
    getLiveQueryOutcome,
    getLiveSourceQueryErrorCode,
    isLiveSourceErrorReportable,
    LIVE_QUERY_OUTCOMES,
} from './outcome';
import { refuseLiveQuery } from './refuse';
import { tooManyRowsError } from './rows';

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

describe('getLiveQueryFailure', () => {
    it('files a row-cap refusal as a refusal, by its code', () => {
        const { errorCode } = getLiveQueryFailure(
            tooManyRowsError({ label: 'Pylon', maxRows: 1_000 }),
        );
        expect(errorCode).toBe('live_source.refused.row_limit');
        expect(getLiveSourceErrorOrigin(errorCode!)).toBe('refused');
        expect(isLiveSourceErrorReportable(errorCode!)).toBe(false);
    });

    it('keeps the code a refusal was thrown with', () => {
        expect(
            getLiveQueryFailure(
                refuseLiveQuery('live_source.refused.call_budget', 'too many'),
            ).errorCode,
        ).toBe('live_source.refused.call_budget');
    });

    it('files our own concurrency limit as internal, without a Sentry issue', () => {
        const failure = getLiveQueryFailure(
            new TooManyRequestsError('busy', {
                liveSourceErrorCode: 'live_source.internal.concurrency_limit',
            }),
        );
        expect(failure).toEqual({
            outcome: 'rate_limited',
            errorCode: 'live_source.internal.concurrency_limit',
        });
        expect(isLiveSourceErrorReportable(failure.errorCode!)).toBe(false);
    });

    it('falls back to the outcome code for errors without one', () => {
        expect(getLiveQueryFailure(new ParameterError('blocked'))).toEqual({
            outcome: 'invalid_request',
            errorCode: 'live_source.internal.invalid_request',
        });
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
