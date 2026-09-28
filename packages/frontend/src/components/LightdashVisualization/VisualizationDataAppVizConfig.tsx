import { ChartType, type DataAppVizChart } from '@lightdash/common';
import { useCallback, useMemo, type FC } from 'react';
import { getDataAppVizQueryFieldIds } from '../../features/chartTypes/utils/pruneDataAppVizQueryFieldOptions';
import useDataAppVizVisualizationConfig from '../../hooks/useDataAppVizVisualizationConfig';
import { type VisualizationDataAppVizConfigProps } from './types';

const VisualizationDataAppVizConfig: FC<VisualizationDataAppVizConfigProps> = ({
    initialChartConfig,
    onChartConfigChange,
    children,
    unsavedMetricQuery,
}) => {
    const handleConfigChange = useCallback(
        (config: DataAppVizChart | null) => {
            onChartConfigChange?.({
                type: ChartType.DATA_APP_VIZ,
                config: config ?? undefined,
            });
        },
        [onChartConfigChange],
    );

    const queryFieldIds = useMemo(
        () =>
            unsavedMetricQuery
                ? getDataAppVizQueryFieldIds(unsavedMetricQuery)
                : null,
        [unsavedMetricQuery],
    );
    const dataAppVizConfig = useDataAppVizVisualizationConfig(
        initialChartConfig,
        handleConfigChange,
        queryFieldIds,
    );

    return children({
        visualizationConfig: {
            chartType: ChartType.DATA_APP_VIZ,
            chartConfig: dataAppVizConfig,
        },
    });
};

export default VisualizationDataAppVizConfig;
