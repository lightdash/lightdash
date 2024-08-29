import {
    ChartKind,
    isVizTableConfig,
    type PivotChartData,
    type VizTableConfig,
} from '@lightdash/common';
import { useCallback, useState } from 'react';
import { type selectChartConfigByKind } from '../../../components/DataViz/store/selectors';
import { SqlRunnerResultsRunner } from '../runners/SqlRunnerResultsRunner';
import { useAppSelector } from '../store/hooks';

/**
 * This hook is used to get the table config for the chart results table.
 * When the pivot data is received, it is used to update the table config so that it matches what is configured/displayed in the chart.
 * @param resultsRunner - The results runner for the chart.
 * @param activeConfigs - The active configs in the SQL Runner.
 * @returns {Object} { tableConfigByChartType, resultsTableRunnerByChartType, handlePivotData } - The table config for the chart results table + the results table runner for the chart results table + the function to handle the pivot data.
 */
export const useChartResultsTableConfig = (
    resultsRunner: SqlRunnerResultsRunner | undefined,
    activeConfigs: {
        chartConfigs: Exclude<
            NonNullable<ReturnType<typeof selectChartConfigByKind>>,
            VizTableConfig
        >[];
        tableConfig: VizTableConfig | undefined;
    },
) => {
    const [tableConfigByChartType, setTableConfigByChartType] = useState<
        | Record<ChartKind, Pick<VizTableConfig, 'columns'> | undefined>
        | undefined
    >();
    const [resultsTableRunnerByChartType, setResultsTableRunnerByChartType] =
        useState<
            Record<ChartKind, SqlRunnerResultsRunner | undefined> | undefined
        >();

    const currentVisualizationType = useAppSelector((state) =>
        state.sqlRunner.selectedChartType === ChartKind.TABLE
            ? activeConfigs.tableConfig
            : activeConfigs.chartConfigs.find(
                  (c) => c.type === state.sqlRunner.selectedChartType,
              ),
    );

    const handlePivotData = useCallback(
        (chartType: ChartKind, pivotData: PivotChartData | undefined) => {
            if (!pivotData) return;

            setTableConfigByChartType((prev) => {
                const config = currentVisualizationType;
                if (config && !isVizTableConfig(config) && config.fieldConfig) {
                    const newTableConfig = resultsRunner?.getResultsColumns(
                        config.fieldConfig,
                    );
                    return {
                        ...prev,
                        [chartType]: newTableConfig,
                    } as Record<
                        ChartKind,
                        Pick<VizTableConfig, 'columns'> | undefined
                    >;
                }
                return prev;
            });

            setResultsTableRunnerByChartType((prev) => {
                const config = currentVisualizationType;
                if (config && !isVizTableConfig(config) && config.fieldConfig) {
                    const newTableConfig = resultsRunner?.getResultsColumns(
                        config.fieldConfig,
                    );
                    if (newTableConfig && pivotData.results) {
                        const newResultsTableRunner =
                            new SqlRunnerResultsRunner({
                                rows: pivotData.results,
                                columns: Object.values(
                                    newTableConfig.columns,
                                ).map((c) => ({
                                    reference: c.reference,
                                })),
                            });
                        return {
                            ...prev,
                            [chartType]: newResultsTableRunner,
                        } as Record<
                            ChartKind,
                            SqlRunnerResultsRunner | undefined
                        >;
                    }
                }
                return prev;
            });
        },
        [currentVisualizationType, resultsRunner],
    );

    return {
        tableConfigByChartType,
        resultsTableRunnerByChartType,
        handlePivotData,
    };
};
