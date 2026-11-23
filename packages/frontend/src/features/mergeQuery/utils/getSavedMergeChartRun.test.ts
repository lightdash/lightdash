import { type SavedChartDAO } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getSavedMergeChartRun } from './getSavedMergeChartRun';

const merged = {
    uuid: 'chart-uuid',
    merge: { queries: {} } as unknown as SavedChartDAO['merge'],
    hasUnpublishedChanges: false,
};

describe('getSavedMergeChartRun', () => {
    it('runs a saved merged chart by uuid in view mode', () => {
        expect(getSavedMergeChartRun(merged, false)).toEqual({
            savedChartUuid: 'chart-uuid',
            includeUnpublishedDraft: false,
        });
    });

    it.each([
        ['edit mode', merged, true],
        ['a chart without a merge', { ...merged, merge: null }, false],
        ['no chart', null, false],
    ])('sends the merge for %s', (_, savedChart, isEditMode) => {
        expect(getSavedMergeChartRun(savedChart, isEditMode)).toBeNull();
    });
});
