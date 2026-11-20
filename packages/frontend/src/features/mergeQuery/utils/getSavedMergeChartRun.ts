import { type SavedChartDAO } from '@lightdash/common';
import { type SavedMergeChartRun } from '../hooks/useMergeQuery';

/** View mode on a saved merged chart runs it by uuid; edit mode sends the merge. */
export const getSavedMergeChartRun = (
    savedChart: Pick<
        SavedChartDAO,
        'uuid' | 'merge' | 'hasUnpublishedChanges'
    > | null,
    isEditMode: boolean,
): SavedMergeChartRun | null =>
    !isEditMode && savedChart?.merge
        ? {
              savedChartUuid: savedChart.uuid,
              includeUnpublishedDraft:
                  savedChart.hasUnpublishedChanges ?? false,
          }
        : null;
