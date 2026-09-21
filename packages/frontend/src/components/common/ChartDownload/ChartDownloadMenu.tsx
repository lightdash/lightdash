import { subject } from '@casl/ability';
import {
    ChartType,
    getCustomLabelsFromColumnProperties,
    getHiddenTableFields,
    getPivotConfig,
    type ApiScheduledDownloadCsv,
} from '@lightdash/common';
import { ActionIcon, Popover } from '@mantine/core';
import { IconShare2 } from '@tabler/icons-react';
import { memo, useCallback, type ReactNode } from 'react';
import DataAppVizDownloadMenu from '../../../features/apps/DataAppVizDownloadMenu';
import useEchartsCartesianConfig from '../../../hooks/echarts/useEchartsCartesianConfig';
import { useAccount } from '../../../hooks/user/useAccount';
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
} from './chartDownloadUtils';

export type ChartDownloadMenuProps = {
    getDownloadQueryUuid: (
        limit: number | null,
        exportPivotedResults?: boolean,
        limitType?: Limit,
    ) => Promise<string>;
    projectUuid: string;
    chartName?: string;
    getGsheetLink?: (
        columnOrder: string[],
        showTableNames: boolean,
        customLabels?: Record<string, string>,
    ) => Promise<ApiScheduledDownloadCsv>;
};

const DownloadPopover = ({
    disabled,
    children,
}: {
    disabled: boolean;
    children: ReactNode;
}) => (
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
        <Popover.Dropdown>{children}</Popover.Dropdown>
    </Popover>
);

const getExportPermissions = ({
    ability,
    isEmbedded,
    canManageExplore,
    organizationUuid,
    projectUuid,
}: {
    ability: ReturnType<typeof useAbilityContext>;
    isEmbedded: boolean;
    canManageExplore: boolean;
    organizationUuid: string | undefined;
    projectUuid: string;
}) => {
    if (isEmbedded) {
        return {
            canExportCsv: ability.can(
                'export',
                subject('SavedChart', {
                    organizationUuid,
                    type: 'csv',
                }),
            ),
            canExportImages: ability.can(
                'export',
                subject('SavedChart', {
                    organizationUuid,
                    type: 'images',
                }),
            ),
        };
    }
    return {
        canExportCsv:
            canManageExplore &&
            ability.can(
                'manage',
                subject('ExportCsv', {
                    organizationUuid,
                    projectUuid,
                }),
            ),
        canExportImages: canManageExplore,
    };
};

const isDownloadDisabled = ({
    isTable,
    totalResults,
    chartType,
    hasCartesianOptions,
}: {
    isTable: boolean;
    totalResults: number | undefined;
    chartType: ChartType;
    hasCartesianOptions: boolean;
}) =>
    (isTable && !totalResults) ||
    (chartType === ChartType.CARTESIAN && !hasCartesianOptions);

const hasNoSupportedExport = (chartType: ChartType) =>
    CHART_TYPES_WITHOUT_IMAGE_EXPORT.includes(chartType) &&
    CHART_TYPES_WITHOUT_DATA_EXPORT.includes(chartType);

const ChartDownloadMenuContent = ({
    chartType,
    projectUuid,
    isEmbedded,
    isTable,
    canExportCsv,
    canExportImages,
    tableDownload,
    imageDownload,
}: {
    chartType: ChartType;
    projectUuid: string;
    isEmbedded: boolean;
    isTable: boolean;
    canExportCsv: boolean;
    canExportImages: boolean;
    tableDownload: ReactNode;
    imageDownload: ReactNode;
}) => {
    if (chartType === ChartType.DATA_APP_VIZ) {
        return canExportImages && !isEmbedded ? (
            <DataAppVizDownloadMenu projectUuid={projectUuid} />
        ) : null;
    }
    if (hasNoSupportedExport(chartType)) return null;
    if (isTable) return canExportCsv ? tableDownload : null;
    return canExportImages ? imageDownload : null;
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
        const isTable = isTableVisualizationConfig(visualizationConfig);

        const disabled = isDownloadDisabled({
            isTable,
            totalResults: resultsData?.totalResults,
            chartType: visualizationConfig.chartType,
            hasCartesianOptions: !!eChartsOptions,
        });

        const { data: account } = useAccount();
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
        const { canExportCsv, canExportImages } = getExportPermissions({
            ability,
            isEmbedded,
            canManageExplore,
            organizationUuid,
            projectUuid,
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
                limitType: Limit,
                exportPivotedData: boolean = true,
            ) => {
                return getDownloadQueryUuid(
                    limit,
                    exportPivotedData,
                    limitType,
                );
            },
            [getDownloadQueryUuid],
        );

        const tableDownload = isTable ? (
            <DownloadPopover disabled={disabled}>
                <ExportSelector
                    projectUuid={projectUuid}
                    totalResults={resultsData?.totalResults}
                    getDownloadQueryUuid={getChartDownloadQueryUuid}
                    columnOrder={visualizationConfig.chartConfig.columnOrder}
                    customLabels={getCustomLabelsFromColumnProperties(
                        visualizationConfig.chartConfig.columnProperties,
                    )}
                    hiddenFields={getHiddenTableFields({
                        type: ChartType.TABLE,
                        config: visualizationConfig.chartConfig.validConfig,
                    })}
                    showTableNames={
                        visualizationConfig.chartConfig.showTableNames
                    }
                    chartName={chartName}
                    pivotConfig={pivotConfig}
                    conditionalFormattings={
                        visualizationConfig.chartConfig.conditionalFormattings
                    }
                    showColumnTotals={
                        visualizationConfig.chartConfig.showColumnCalculation
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
                                          visualizationConfig.chartConfig
                                              .columnProperties,
                                      ),
                                  )
                    }
                />
            </DownloadPopover>
        ) : null;

        return (
            <ChartDownloadMenuContent
                chartType={visualizationConfig.chartType}
                projectUuid={projectUuid}
                isEmbedded={isEmbedded}
                isTable={isTable}
                canExportCsv={canExportCsv}
                canExportImages={canExportImages}
                tableDownload={tableDownload}
                imageDownload={
                    <DownloadPopover disabled={disabled}>
                        {chartRef.current ? (
                            <ChartDownloadOptions
                                getChartInstance={getChartInstance}
                            />
                        ) : null}
                    </DownloadPopover>
                }
            />
        );
    },
);

export default ChartDownloadMenu;
