import { describe, expect, it } from 'vitest';
import { buildLineageProps } from './useLightdash';

describe('buildLineageProps', () => {
    it('returns the data-ld-query attribute once a queryUuid is known', () => {
        expect(buildLineageProps('abc-123')).toEqual({ 'data-ld-query': 'abc-123' });
    });

    it('returns an empty (spread-safe) object before the query resolves', () => {
        expect(buildLineageProps(null)).toEqual({});
    });
});
