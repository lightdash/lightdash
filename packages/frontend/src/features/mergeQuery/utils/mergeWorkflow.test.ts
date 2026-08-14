import { describe, expect, it } from 'vitest';
import {
    getEffectiveMergeFocus,
    isMergeSourceBReady,
    isMergeSourceReady,
} from './mergeWorkflow';

describe('merge workflow', () => {
    it('requires a dimension and metric in each source', () => {
        expect(isMergeSourceReady({ dimensions: ['id'], metrics: [] })).toBe(
            false,
        );
        expect(
            isMergeSourceReady({ dimensions: ['id'], metrics: ['count'] }),
        ).toBe(true);
    });

    it('keeps the second source incomplete while its table picker is open', () => {
        const query = {
            exploreName: 'customers',
            dimensions: ['customer_id'],
            metrics: ['customer_count'],
        };

        expect(isMergeSourceBReady(query, true)).toBe(false);
        expect(isMergeSourceBReady(query, false)).toBe(true);
    });

    it('returns users to the earliest incomplete step', () => {
        expect(
            getEffectiveMergeFocus({
                requested: 'join',
                queryAReady: false,
                queryBReady: false,
            }),
        ).toBe('a');
        expect(
            getEffectiveMergeFocus({
                requested: 'join',
                queryAReady: true,
                queryBReady: false,
            }),
        ).toBe('b');
    });
});
