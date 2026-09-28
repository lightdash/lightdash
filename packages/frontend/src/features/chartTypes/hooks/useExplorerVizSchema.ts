import { ChartType } from '@lightdash/common';
import useEmbed from '../../../ee/providers/Embed/useEmbed';
import { useChartVersionPreview } from '../../apps/ChartVersionPreview/useChartVersionPreview';
import {
    selectIsEditMode,
    selectSavedChart,
    selectUnsavedChartVersion,
    useExplorerSelector,
} from '../../explorer/store';
import { useDataAppVizRenderMetadata } from './useDataAppVizRender';

/** The schema of the custom chart type the Explorer is currently rendering. */
export const useExplorerVizSchema = ({
    projectUuid,
    savedQueryUuid,
}: {
    projectUuid: string | undefined;
    savedQueryUuid: string | undefined;
}) => {
    const savedChart = useExplorerSelector(selectSavedChart);
    const isEditMode = useExplorerSelector(selectIsEditMode);
    const { chartConfig } = useExplorerSelector(selectUnsavedChartVersion);
    const chartVersionUuid = useChartVersionPreview();
    const embed = useEmbed();

    const vizConfig =
        chartConfig.type === ChartType.DATA_APP_VIZ
            ? chartConfig.config
            : undefined;
    const vizUuid = vizConfig?.dataAppVizUuid ?? null;
    const savedVizConfig =
        savedChart?.chartConfig.type === ChartType.DATA_APP_VIZ
            ? savedChart.chartConfig.config
            : undefined;
    const matchesSavedBinding =
        chartConfig.type === ChartType.DATA_APP_VIZ &&
        vizConfig?.dataAppVizUuid === savedVizConfig?.dataAppVizUuid &&
        vizConfig?.dataAppVizVersion === savedVizConfig?.dataAppVizVersion;
    // An edited binding has no saved chart to authorize against yet.
    const metadataSavedChartUuid =
        chartVersionUuid || !isEditMode || matchesSavedBinding
            ? savedChart?.uuid
            : undefined;
    const waitingForSavedChart =
        !!savedQueryUuid && !savedChart && (!isEditMode || !!chartVersionUuid);

    const metadata = useDataAppVizRenderMetadata(
        projectUuid,
        waitingForSavedChart ? null : vizUuid,
        {
            isEmbedded: !!embed.embedToken,
            savedChartUuid: metadataSavedChartUuid,
            chartVersionUuid,
        },
        embed.embedToken || metadataSavedChartUuid || !isEditMode
            ? vizConfig?.dataAppVizVersion
            : undefined,
    );

    return {
        vizUuid,
        metadata,
        schema: metadata.data?.state === 'ready' ? metadata.data.schema : null,
    };
};
