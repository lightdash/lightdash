import { describe, expect, it } from 'vitest';
import { buildLineageProps } from './useLightdash';

describe('buildLineageProps', () => {
    it('returns the data-ld-query attribute once a queryUuid is known', () => {
        expect(buildLineageProps('abc-123', null)).toEqual({
            'data-ld-query': 'abc-123',
        });
    });

    it('returns an empty (spread-safe) object before the query resolves', () => {
        expect(buildLineageProps(null, null)).toEqual({});
    });

    it('stamps the author id before the query resolves', () => {
        expect(buildLineageProps(null, 'revenue-forecast')).toEqual({
            'data-ld-query-id': 'revenue-forecast',
        });
    });

    it('stamps both the author id and queryUuid once loaded', () => {
        expect(buildLineageProps('abc-123', 'revenue-forecast')).toEqual({
            'data-ld-query-id': 'revenue-forecast',
            'data-ld-query': 'abc-123',
        });
    });
});
