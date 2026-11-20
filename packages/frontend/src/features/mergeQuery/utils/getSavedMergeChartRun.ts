import { type SavedChartDAO } from '@lightdash/common';
import { type SavedMergeChartRun } from '../hooks/useMergeQuery';

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
