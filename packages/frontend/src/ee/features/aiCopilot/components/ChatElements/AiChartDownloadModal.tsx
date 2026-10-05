import {
    ChartType,
    getCustomLabelsFromColumnProperties,
    getHiddenTableFields,
    getPivotConfig,
    type MergeQuery,
} from '@lightdash/common';
import { useCallback, type FC } from 'react';
import ExportDataModal from '../../../../../components/DashboardTiles/ExportDataModal';
import { type Limit } from '../../../../../components/ExportResults/types';
import { isTableVisualizationConfig } from '../../../../../components/LightdashVisualization/types';
import { useVisualizationContext } from '../../../../../components/LightdashVisualization/useVisualizationContext';
import { executeAiChartDownloadQuery } from '../../utils/executeAiChartDownloadQuery';

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    chartName: string | null;
    mergeQuery: MergeQuery | null;
    /** Downloads this already-executed query as shown, without re-running it. */
    executedQueryUuid: string | null;
};

export const AiChartDownloadModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    chartName,
    mergeQuery,
    executedQueryUuid,
}) => {
    const {
        chartConfig,
        columnOrder,
        itemsMap,
        parameters,
        pivotDimensions,
        resultsData,
        visualizationConfig,
    } = useVisualizationContext();

    const metricQuery = resultsData?.metricQuery;
    const tableConfig = isTableVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig
        : undefined;
    const savedPivotConfig = pivotDimensions?.length
        ? {
              columns: pivotDimensions,
              ...(tableConfig?.configuredRowFieldIds && {
                  rows: tableConfig.configuredRowFieldIds,
              }),
          }
        : undefined;
    const downloadPivotConfig = metricQuery
        ? getPivotConfig({
              chartConfig,
              pivotConfig: savedPivotConfig,
              tableConfig: { columnOrder },
              metricQuery,
          })
        : undefined;

    const getDownloadQueryUuid = useCallback(
        async (
            limit: number | null,
            _limitType: Limit,
            exportPivotedData: boolean = true,
        ) => {
            if (executedQueryUuid) return executedQueryUuid;

            if (!metricQuery || !itemsMap) {
                throw new Error('Missing artifact query data');
            }

            return executeAiChartDownloadQuery({
                projectUuid,
                metricQuery,
                parameters,
                chartConfig,
                pivotDimensions,
                fields: itemsMap,
                mergeQuery,
                limit,
                exportPivotedData,
            });
        },
        [
            chartConfig,
            executedQueryUuid,
            itemsMap,
            mergeQuery,
            metricQuery,
            parameters,
            pivotDimensions,
            projectUuid,
        ],
    );

    return (
        <ExportDataModal
            isOpen={opened}
            onClose={onClose}
            projectUuid={projectUuid}
            totalResults={resultsData?.totalResults}
            getDownloadQueryUuid={getDownloadQueryUuid}
            columnOrder={columnOrder}
            chartName={chartName ?? undefined}
            pivotConfig={executedQueryUuid ? undefined : downloadPivotConfig}
            hideLimitSelection={!!executedQueryUuid}
            customLabels={
                tableConfig
                    ? getCustomLabelsFromColumnProperties(
                          tableConfig.columnProperties,
                      )
                    : undefined
            }
            hiddenFields={
                tableConfig
                    ? getHiddenTableFields({
                          type: ChartType.TABLE,
                          config: tableConfig.validConfig,
                      })
                    : undefined
            }
            showTableNames={tableConfig?.showTableNames}
            conditionalFormattings={tableConfig?.conditionalFormattings}
            showColumnTotals={tableConfig?.showColumnCalculation}
        />
    );
};
