import {
    ParameterError,
    TimeoutError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getApiQueryOutcome } from './apiQueryOutcome';

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
