import {
    ComposerChartNotSupportedError,
    type SkippedChart,
} from '@lightdash/common';
import { type SavedChartModel } from './SavedChartModel';

export type ComposerChartPartition = {
    /** The charts the bulk surface handles. */
    supported: string[];
    /** The live composer charts it leaves out, named so the caller can report them. */
    skipped: SkippedChart[];
};

/** Splits chart uuids for a bulk surface that reads classic versions: composer charts are left out and named rather than failing the batch. */
export const partitionComposerCharts = async (
    savedChartModel: Pick<SavedChartModel, 'findComposerCharts'>,
    savedChartUuids: string[],
): Promise<ComposerChartPartition> => {
    const composerCharts =
        await savedChartModel.findComposerCharts(savedChartUuids);
    const composerChartUuids = new Set(
        composerCharts.map((composerChart) => composerChart.uuid),
    );
    return {
        supported: savedChartUuids.filter(
            (uuid) => !composerChartUuids.has(uuid),
        ),
        skipped: composerCharts.map((composerChart) => ({
            ...composerChart,
            reason: new ComposerChartNotSupportedError(composerChart.uuid)
                .message,
        })),
    };
};
