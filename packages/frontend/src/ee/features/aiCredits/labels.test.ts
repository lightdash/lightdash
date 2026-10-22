import { AI_BILLABLE_FEATURES } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { AI_CREDIT_FEATURE_LABELS } from './labels';

describe('AI credit feature labels', () => {
    it('names every billable feature the way admins know it', () => {
        expect(
            AI_BILLABLE_FEATURES.map(
                (feature) => AI_CREDIT_FEATURE_LABELS[feature],
            ),
        ).toEqual([
            'Ask AI',
            'Deep Research',
            'Ask AI Tool',
            'Compaction',
            'Data App',
        ]);
    });
});
