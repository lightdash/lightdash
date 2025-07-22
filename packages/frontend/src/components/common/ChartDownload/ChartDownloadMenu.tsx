import { subject } from '@casl/ability';
import {
    ChartType,
    getCustomLabelsFromColumnProperties,
    getHiddenTableFields,
    type ApiScheduledDownloadCsv,
    type PivotConfig,
} from '@lightdash/common';
import { ActionIcon, Popover } from '@mantine/core';
import { IconShare2 } from '@tabler/icons-react';
import { memo, useCallback } from 'react';
import useEchartsCartesianConfig from '../../../hooks/echarts/useEchartsCartesianConfig';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import ExportSelector from '../../ExportSelector';
import { isTableVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import {
    COLLAPSABLE_CARD_ACTION_ICON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../CollapsableCard/constants';
import MantineIcon from '../MantineIcon';
import ChartDownloadOptions from './ChartDownloadOptions';
import { createPivotConfigFromVisualization } from './chartDownloadUtils';

export type ChartDownloadMenuProps = {
    getDownloadQueryUuid: (limit: number | null) => Promise<string>;
    projectUuid: string;
    chartName?: string;
    getGsheetLink?: (
        columnOrder: string[],
        showTableNames: boolean,
        customLabels?: Record<string, string>,
    ) => Promise<ApiScheduledDownloadCsv>;
};

const ChartDownloadMenu: React.FC<ChartDownloadMenuProps> = memo(
    ({ getDownloadQueryUuid, getGsheetLink, projectUuid, chartName }) => {
        const { chartRef, visualizationConfig, resultsData, pivotDimensions } =
            useVisualizationContext();

        const eChartsOptions = useEchartsCartesianConfig();

        const disabled =
            (isTableVisualizationConfig(visualizationConfig) &&
                !resultsData?.totalResults) ||
            (visualizationConfig.chartType === ChartType.CARTESIAN &&
                !eChartsOptions);

        const { user } = useApp();

        const getChartInstance = useCallback(
            () => chartRef.current?.getEchartsInstance(),
            [chartRef],
        );

        // Build pivot config for table visualizations with pivot dimensions
        const pivotConfig: PivotConfig | undefined =
            isTableVisualizationConfig(visualizationConfig) &&
            pivotDimensions &&
            pivotDimensions.length > 0
                ? createPivotConfigFromVisualization(
                      visualizationConfig,
                      pivotDimensions,
                  )
                : undefined;

        return isTableVisualizationConfig(visualizationConfig) &&
            getDownloadQueryUuid ? (
            <Can
                I="manage"
                this={subject('ExportCsv', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid,
                })}
            >
                <Popover
                    {...COLLAPSABLE_CARD_POPOVER_PROPS}
                    disabled={disabled}
                    position="bottom-end"
                >
                    <Popover.Target>
                        <ActionIcon
                            data-testid="export-csv-button"
                            {...COLLAPSABLE_CARD_ACTION_ICON_PROPS}
                            disabled={disabled}
                        >
                            <MantineIcon icon={IconShare2} color="gray" />
                        </ActionIcon>
                    </Popover.Target>

                    <Popover.Dropdown>
                        <ExportSelector
                            projectUuid={projectUuid}
                            totalResults={resultsData?.totalResults}
                            getDownloadQueryUuid={getDownloadQueryUuid}
                            columnOrder={
                                visualizationConfig.chartConfig.columnOrder
                            }
                            customLabels={getCustomLabelsFromColumnProperties(
                                visualizationConfig.chartConfig
                                    .columnProperties,
                            )}
                            hiddenFields={getHiddenTableFields({
                                type: ChartType.TABLE,
                                config: visualizationConfig.chartConfig
                                    .validConfig,
                            })}
                            showTableNames={
                                visualizationConfig.chartConfig.showTableNames
                            }
                            chartName={chartName}
                            pivotConfig={pivotConfig}
                            getGsheetLink={
                                getGsheetLink === undefined
                                    ? undefined
                                    : () =>
                                          getGsheetLink(
                                              visualizationConfig.chartConfig
                                                  .columnOrder,
                                              visualizationConfig.chartConfig
                                                  .showTableNames,
                                              getCustomLabelsFromColumnProperties(
                                                  visualizationConfig
                                                      .chartConfig
                                                      .columnProperties,
                                              ),
                                          )
                            }
                        />
                    </Popover.Dropdown>
                </Popover>
            </Can>
        ) : isTableVisualizationConfig(visualizationConfig) &&
          !getDownloadQueryUuid ? null : (
            <Popover
                {...COLLAPSABLE_CARD_POPOVER_PROPS}
                disabled={disabled}
                position="bottom-end"
            >
                <Popover.Target>
                    <ActionIcon
                        data-testid="export-csv-button"
                        {...COLLAPSABLE_CARD_ACTION_ICON_PROPS}
                        disabled={disabled}
                    >
                        <MantineIcon icon={IconShare2} color="gray" />
                    </ActionIcon>
                </Popover.Target>

                <Popover.Dropdown>
                    {visualizationConfig?.chartType &&
                    !isTableVisualizationConfig(visualizationConfig) &&
                    chartRef.current ? (
                        <ChartDownloadOptions
                            getChartInstance={getChartInstance}
                        />
                    ) : null}
                </Popover.Dropdown>
            </Popover>
        );
    },
);

export default ChartDownloadMenu;
