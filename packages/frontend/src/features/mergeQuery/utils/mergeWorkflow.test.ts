import { describe, expect, it } from 'vitest';
import { isMergeSourceReady } from './mergeWorkflow';

describe('merge workflow', () => {
    it('requires a dimension and metric in each source', () => {
        expect(isMergeSourceReady({ dimensions: ['id'], metrics: [] })).toBe(
            false,
        );
        expect(
            isMergeSourceReady({ dimensions: ['id'], metrics: ['count'] }),
        ).toBe(true);
    });
});
