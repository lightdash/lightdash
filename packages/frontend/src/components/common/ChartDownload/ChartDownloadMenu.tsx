import { subject } from '@casl/ability';
import {
    ChartType,
    getCustomLabelsFromColumnProperties,
    getHiddenTableFields,
    getPivotConfig,
    type ApiScheduledDownloadCsv,
} from '@lightdash/common';
import { ActionIcon, Button, Popover } from '@mantine/core';
import { IconShare2 } from '@tabler/icons-react';
import { memo, useCallback } from 'react';
import { useChartVersionPreview } from '../../../features/apps/ChartVersionPreview/useChartVersionPreview';
import {
    selectHasUnsavedChanges,
    selectSavedChart,
    useExplorerSelector,
} from '../../../features/explorer/store';
import useEchartsCartesianConfig from '../../../hooks/echarts/useEchartsCartesianConfig';
import { useDateZoomGranularitySearch } from '../../../hooks/useExplorerRoute';
import { useAccount } from '../../../hooks/user/useAccount';
import { useSavedChartImageExport } from '../../../hooks/useSavedChartImageExport';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import { type Limit } from '../../ExportResults/types';
import ExportSelector from '../../ExportSelector';
import { isTableVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import {
    COLLAPSABLE_CARD_ACTION_ICON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../CollapsableCard/constants';
import MantineIcon from '../MantineIcon';
import ChartDownloadOptions from './ChartDownloadOptions';
import {
    CHART_TYPES_WITHOUT_DATA_EXPORT,
    CHART_TYPES_WITHOUT_IMAGE_EXPORT,
    isSavedDataAppVizImageExportAvailable,
} from './chartDownloadUtils';

export type ChartDownloadMenuProps = {
    getDownloadQueryUuid: (
        limit: number | null,
        exportPivotedResults?: boolean,
    ) => Promise<string>;
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
        const {
            chartRef,
            visualizationConfig,
            resultsData,
            pivotDimensions,
            chartConfig,
            columnOrder,
        } = useVisualizationContext();

        const eChartsOptions = useEchartsCartesianConfig();

        const disabled =
            (isTableVisualizationConfig(visualizationConfig) &&
                !resultsData?.totalResults) ||
            (visualizationConfig.chartType === ChartType.CARTESIAN &&
                !eChartsOptions);

        const { data: account } = useAccount();
        const savedChart = useExplorerSelector(selectSavedChart);
        const hasUnsavedChanges = useExplorerSelector(selectHasUnsavedChanges);
        const dateZoomGranularity = useDateZoomGranularitySearch();
        const chartVersionPreview = useChartVersionPreview();
        const { mutate: exportSavedChartImage, isLoading: isExportingImage } =
            useSavedChartImageExport();
        const ability = useAbilityContext();
        const organizationUuid = account?.organization.organizationUuid;
        const isEmbedded = account?.isJwtUser() === true;
        const canManageExplore = ability.can(
            'manage',
            subject('Explore', {
                organizationUuid,
                projectUuid,
            }),
        );
        const canExportCsv = isEmbedded
            ? ability.can(
                  'export',
                  subject('SavedChart', {
                      organizationUuid,
                      type: 'csv',
                  }),
              )
            : canManageExplore &&
              ability.can(
                  'manage',
                  subject('ExportCsv', {
                      organizationUuid,
                      projectUuid,
                  }),
              );
        const canExportImages = isEmbedded
            ? ability.can(
                  'export',
                  subject('SavedChart', {
                      organizationUuid,
                      type: 'images',
                  }),
              )
            : canManageExplore;
        const canExportSavedDataAppVizImage =
            canManageExplore &&
            isSavedDataAppVizImageExportAvailable({
                chartType: visualizationConfig.chartType,
                isEmbedded,
                hasSavedChart: savedChart !== undefined,
                hasUnsavedChanges:
                    hasUnsavedChanges ||
                    !!dateZoomGranularity ||
                    chartVersionPreview !== undefined,
            });

        const getChartInstance = useCallback(
            () => chartRef.current?.getEchartsInstance(),
            [chartRef],
        );

        // Build pivot config with pivot dimensions. metricQuery is required to
        // classify hidden fields; without results there is nothing to pivot yet.
        const pivotConfig = resultsData?.metricQuery
            ? getPivotConfig({
                  chartConfig,
                  pivotConfig: pivotDimensions
                      ? {
                            columns: pivotDimensions,
                            ...(isTableVisualizationConfig(
                                visualizationConfig,
                            ) &&
                                visualizationConfig.chartConfig
                                    .configuredRowFieldIds && {
                                    rows: visualizationConfig.chartConfig
                                        .configuredRowFieldIds,
                                }),
                        }
                      : undefined,
                  tableConfig: {
                      columnOrder,
                  },
                  metricQuery: resultsData.metricQuery,
              })
            : undefined;

        const getChartDownloadQueryUuid = useCallback(
            (
                limit: number | null,
                _limitType: Limit,
                exportPivotedData: boolean = true,
            ) => {
                return getDownloadQueryUuid(limit, exportPivotedData);
            },
            [getDownloadQueryUuid],
        );

        if (
            CHART_TYPES_WITHOUT_IMAGE_EXPORT.includes(
                visualizationConfig.chartType,
            ) &&
            CHART_TYPES_WITHOUT_DATA_EXPORT.includes(
                visualizationConfig.chartType,
            ) &&
            !canExportSavedDataAppVizImage
        ) {
            return null;
        }
        return isTableVisualizationConfig(visualizationConfig) &&
            getChartDownloadQueryUuid ? (
            canExportCsv ? (
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
                            <MantineIcon icon={IconShare2} />
                        </ActionIcon>
                    </Popover.Target>

                    <Popover.Dropdown>
                        <ExportSelector
                            projectUuid={projectUuid}
                            totalResults={resultsData?.totalResults}
                            getDownloadQueryUuid={getChartDownloadQueryUuid}
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
                            conditionalFormattings={
                                visualizationConfig.chartConfig
                                    .conditionalFormattings
                            }
                            showColumnTotals={
                                visualizationConfig.chartConfig
                                    .showColumnCalculation
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
            ) : null
        ) : isTableVisualizationConfig(visualizationConfig) &&
          !getDownloadQueryUuid ? null : canExportImages ? (
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
                        <MantineIcon icon={IconShare2} />
                    </ActionIcon>
                </Popover.Target>

                <Popover.Dropdown>
                    {canExportSavedDataAppVizImage && savedChart ? (
                        <Button
                            size="xs"
                            loading={isExportingImage}
                            onClick={() =>
                                exportSavedChartImage({
                                    chartUuid: savedChart.uuid,
                                    projectUuid,
                                    chartName: savedChart.name,
                                })
                            }
                        >
                            Export PNG
                        </Button>
                    ) : visualizationConfig?.chartType &&
                      !isTableVisualizationConfig(visualizationConfig) &&
                      chartRef.current ? (
                        <ChartDownloadOptions
                            getChartInstance={getChartInstance}
                        />
                    ) : null}
                </Popover.Dropdown>
            </Popover>
        ) : null;
    },
);

export default ChartDownloadMenu;
