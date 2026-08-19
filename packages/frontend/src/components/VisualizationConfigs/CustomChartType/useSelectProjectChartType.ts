import {
    ChartType,
    deriveDataAppVizPivotConfig,
    type DataAppViz,
    type ItemsMap,
} from '@lightdash/common';
import { useCallback } from 'react';
import { autoMapDataAppVizFields } from '../../../features/chartTypes/utils/autoMapDataAppVizFields';
import {
    explorerActions,
    useExplorerDispatch,
} from '../../../features/explorer/store';

/**
 * Move the chart onto one of the project's reusable chart types.
 *
 * Switching from Vega has to land the type and the chosen visualization
 * together: `setChartType` alone would restore whatever data-app-viz config was
 * last cached, which is not what the user just picked. `setChartType` still runs
 * first so the outgoing Vega spec reaches the cache and is there if they switch
 * back.
 */
export const useSelectProjectChartType = () => {
    const dispatch = useExplorerDispatch();

    return useCallback(
        (dataAppViz: DataAppViz, itemsMap: ItemsMap) => {
            const fields = dataAppViz.schema?.fields ?? [];
            const fieldMapping = autoMapDataAppVizFields(fields, itemsMap);
            dispatch(
                explorerActions.setChartType({
                    chartType: ChartType.DATA_APP_VIZ,
                }),
            );
            dispatch(
                explorerActions.setChartConfig({
                    chartConfig: {
                        type: ChartType.DATA_APP_VIZ,
                        config: {
                            dataAppVizUuid: dataAppViz.dataAppVizUuid,
                            fieldMapping,
                            optionValues: {},
                        },
                    },
                }),
            );
            dispatch(
                explorerActions.setPivotConfig(
                    deriveDataAppVizPivotConfig(fields, fieldMapping),
                ),
            );
        },
        [dispatch],
    );
};

/**
 * Start a new custom chart type: move to an empty data-app-viz config, which is
 * the state the build dock treats as "describe a new visualization".
 */
export const useCreateProjectChartType = () => {
    const dispatch = useExplorerDispatch();

    return useCallback(() => {
        dispatch(
            explorerActions.setChartType({
                chartType: ChartType.DATA_APP_VIZ,
            }),
        );
        dispatch(
            explorerActions.setChartConfig({
                chartConfig: {
                    type: ChartType.DATA_APP_VIZ,
                    config: {
                        dataAppVizUuid: '',
                        fieldMapping: {},
                        optionValues: {},
                    },
                },
            }),
        );
        dispatch(explorerActions.setPivotConfig(undefined));
    }, [dispatch]);
};
