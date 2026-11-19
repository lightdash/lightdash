import {
    ParameterError,
    TimeoutError,
    toLiveSourceErrorData,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { assertMaxRows } from '../integration';
import {
    getLiveQueryOutcome,
    getLiveSourceErrorCode,
    isLiveSourceErrorReportable,
} from './outcome';
import { tooManyRowsError } from './rows';

const ownLimit = new TooManyRequestsError('busy', {
    retryAfterSeconds: 5,
    ...toLiveSourceErrorData('live_source.internal.limit'),
});
const callLimit = new ParameterError(
    'too many calls',
    toLiveSourceErrorData('live_source.refused.call_limit'),
);
const rowLimit = tooManyRowsError({ label: 'Pylon', maxRows: 9_999 });
const maxRowsError = (() => {
    try {
        assertMaxRows(10_000, 9_999);
    } catch (error) {
        return error;
    }
    throw new Error('assertMaxRows did not throw');
})();

describe('getLiveQueryOutcome', () => {
    it.each([
        [new ParameterError('blocked'), 'invalid_request'],
        [new WarehouseQueryError('bad HogQL'), 'query_error'],
        [new WarehouseConnectionError('bad key'), 'connection_error'],
        [new TooManyRequestsError('budget'), 'rate_limited'],
        [new TimeoutError('slow'), 'timeout'],
        [new UnexpectedServerError('502'), 'upstream_error'],
        [new Error('S3 is not enabled'), 'internal_error'],
        [rowLimit, 'refused'],
        [maxRowsError, 'refused'],
        [callLimit, 'refused'],
        [ownLimit, 'limited'],
    ])('buckets %s as %s', (error, outcome) => {
        expect(getLiveQueryOutcome(error)).toBe(outcome);
    });
});

describe('getLiveSourceErrorCode', () => {
    it.each([
        [new ParameterError('blocked'), 'live_source.internal.invalid_request'],
        [
            new WarehouseQueryError('bad HogQL'),
            'live_source.upstream.invalid_request',
        ],
        [new WarehouseConnectionError('bad key'), 'live_source.upstream.auth'],
        [
            new TooManyRequestsError('budget'),
            'live_source.upstream.rate_limited',
        ],
        [new TimeoutError('slow'), 'live_source.upstream.timeout'],
        [new UnexpectedServerError('502'), 'live_source.upstream.unknown'],
        [new Error('S3 is not enabled'), 'live_source.internal.error'],
        [rowLimit, 'live_source.refused.row_limit'],
        [maxRowsError, 'live_source.refused.row_limit'],
        [callLimit, 'live_source.refused.call_limit'],
        [ownLimit, 'live_source.internal.limit'],
    ])("codes %s as %s, ours apart from the integration's", (error, code) => {
        expect(getLiveSourceErrorCode(error)).toBe(code);
    });

    it('reports every failure of ours and the integration rejecting or not understanding', () => {
        expect(
            [
                'live_source.internal.invalid_request',
                'live_source.internal.error',
                'live_source.internal.limit',
                'live_source.refused.row_limit',
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
