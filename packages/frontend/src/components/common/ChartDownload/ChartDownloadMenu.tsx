import { subject } from '@casl/ability';
import {
    getCustomLabelsFromColumnProperties,
    type ApiScheduledDownloadCsv,
} from '@lightdash/common';
import { ActionIcon, Popover } from '@mantine/core';
import { IconShare2 } from '@tabler/icons-react';
import { memo, useCallback } from 'react';
import useEchartsCartesianConfig from '../../../hooks/echarts/useEchartsCartesianConfig';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import ExportSelector from '../../ExportSelector';
import {
    isBigNumberVisualizationConfig,
    isCartesianVisualizationConfig,
    isCustomVisualizationConfig,
    isTableVisualizationConfig,
} from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import {
    COLLAPSABLE_CARD_ACTION_ICON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../CollapsableCard/constants';
import MantineIcon from '../MantineIcon';
import ChartDownloadOptions from './ChartDownloadOptions';

interface ChartDownloadMenuProps {
    projectUuid: string;
    getCsvLink?: (
        limit: number | null,
        onlyRaw: boolean,
        showTableNames: boolean,
        columnOrder: string[],
        customLabels?: Record<string, string>,
    ) => Promise<ApiScheduledDownloadCsv>;
    getGsheetLink?: (
        columnOrder: string[],
        showTableNames: boolean,
        customLabels?: Record<string, string>,
    ) => Promise<ApiScheduledDownloadCsv>;
}

const ChartDownloadMenu: React.FC<ChartDownloadMenuProps> = memo(
    ({ getCsvLink, getGsheetLink, projectUuid }) => {
        const { chartRef, visualizationConfig, resultsData } =
            useVisualizationContext();

        const eChartsOptions = useEchartsCartesianConfig();

        const disabled =
            (isTableVisualizationConfig(visualizationConfig) &&
                resultsData?.rows &&
                resultsData.rows.length <= 0) ||
            !resultsData?.metricQuery ||
            isBigNumberVisualizationConfig(visualizationConfig) ||
            (isCartesianVisualizationConfig(visualizationConfig) &&
                !eChartsOptions) ||
            isCustomVisualizationConfig(visualizationConfig);

        const { user } = useApp();

        const getChartInstance = useCallback(
            () => chartRef.current?.getEchartsInstance(),
            [chartRef],
        );

        return isTableVisualizationConfig(visualizationConfig) && getCsvLink ? (
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
                            totalResults={resultsData?.rows.length}
                            getCsvLink={async (
                                limit: number | null,
                                onlyRaw: boolean,
                            ) =>
                                getCsvLink(
                                    limit,
                                    onlyRaw,
                                    visualizationConfig.chartConfig
                                        .showTableNames,
                                    visualizationConfig.chartConfig.columnOrder,
                                    getCustomLabelsFromColumnProperties(
                                        visualizationConfig.chartConfig
                                            .columnProperties,
                                    ),
                                )
                            }
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
          !getCsvLink ? null : (
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
