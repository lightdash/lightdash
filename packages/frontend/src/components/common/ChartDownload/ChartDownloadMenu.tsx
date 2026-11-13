import { subject } from '@casl/ability';
import {
    ChartType,
    getCustomLabelsFromColumnProperties,
    getHiddenTableFields,
    getPivotConfig,
    type ApiScheduledDownloadCsv,
} from '@lightdash/common';
import {
    ActionIcon,
    Popover,
    SegmentedControl,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { memo, useCallback, useState, type FC, type ReactNode } from 'react';
import DataAppVizDownloadMenu from '../../../features/apps/DataAppVizDownloadMenu';
import useEchartsCartesianConfig from '../../../hooks/echarts/useEchartsCartesianConfig';
import { useAccount } from '../../../hooks/user/useAccount';
import { useCanExportEmbeddedContent } from '../../../hooks/user/useCanExportEmbeddedContent';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import { type Limit } from '../../ExportResults/types';
import ExportSelector from '../../ExportSelector';
import { isTableVisualizationConfig } from '../../LightdashVisualization/types';
import {
    useVisualizationServices,
    useEditedChartConfig,
    useVisualizationConfig,
    useVisualizationInputs,
} from '../../LightdashVisualization/useVisualizationContext';
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

type ExportPart = {
    key: 'results' | 'chart';
    label: string;
    disabled: boolean;
    content: ReactNode;
};

const ExportPopover: FC<{ parts: ExportPart[] }> = ({ parts }) => {
    const [selectedKey, setSelectedKey] = useState<ExportPart['key'] | null>(
        null,
    );
    if (parts.length === 0) return null;

    const firstEnabled = parts.find((part) => !part.disabled);
    const active =
        parts.find((part) => part.key === selectedKey && !part.disabled) ??
        firstEnabled ??
        parts[0];
    const allDisabled = firstEnabled === undefined;
    const label =
        parts.length > 1 ? 'Export' : `Export ${active.label.toLowerCase()}`;

    return (
        <Popover
            {...COLLAPSABLE_CARD_POPOVER_PROPS}
            disabled={allDisabled}
            position="bottom-end"
        >
            <Popover.Target>
                <Tooltip label={label}>
                    <ActionIcon
                        data-testid="export-csv-button"
                        aria-label={label}
                        {...COLLAPSABLE_CARD_ACTION_ICON_PROPS}
                        disabled={allDisabled}
                    >
                        <MantineIcon icon={IconDownload} />
                    </ActionIcon>
                </Tooltip>
            </Popover.Target>

            <Popover.Dropdown>
                <Stack gap="sm" miw={240}>
                    {parts.length > 1 && (
                        <SegmentedControl
                            size="xs"
                            fullWidth
                            value={active.key}
                            onChange={(value) =>
                                setSelectedKey(
                                    parts.find((part) => part.key === value)
                                        ?.key ?? null,
                                )
                            }
                            data={parts.map((part) => ({
                                value: part.key,
                                label: part.label,
                                disabled: part.disabled,
                            }))}
                        />
                    )}
                    {active.content}
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

const ChartDownloadMenu: React.FC<ChartDownloadMenuProps> = memo(
    ({ getDownloadQueryUuid, getGsheetLink, projectUuid, chartName }) => {
        const { chartRef } = useVisualizationServices();
        const visualizationConfig = useVisualizationConfig();
        const chartConfig = useEditedChartConfig();
        const { resultsData, pivotDimensions, columnOrder } =
            useVisualizationInputs();

        const eChartsOptions = useEchartsCartesianConfig();

        const disabled =
            (isTableVisualizationConfig(visualizationConfig) &&
                !resultsData?.totalResults) ||
            (visualizationConfig.chartType === ChartType.CARTESIAN &&
                !eChartsOptions);

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
        const canEmbedExportCsv = useCanExportEmbeddedContent('csv');
        const canEmbedExportImages = useCanExportEmbeddedContent('images');
        const canExportCsv =
            canEmbedExportCsv ||
            (canManageExplore &&
                ability.can(
                    'manage',
                    subject('ExportCsv', {
                        organizationUuid,
                        projectUuid,
                    }),
                ));
        // Native image export rides on manage:Explore, so embeds must not fall back to it.
        const canExportImages = isEmbedded
            ? canEmbedExportImages
            : canManageExplore;
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

        if (visualizationConfig.chartType === ChartType.DATA_APP_VIZ) {
            return canExportImages && !isEmbedded ? (
                <DataAppVizDownloadMenu projectUuid={projectUuid} />
            ) : null;
        }

        const getChartPart = (): ExportPart | null => {
            if (
                CHART_TYPES_WITHOUT_IMAGE_EXPORT.includes(
                    visualizationConfig.chartType,
                ) &&
                CHART_TYPES_WITHOUT_DATA_EXPORT.includes(
                    visualizationConfig.chartType,
                )
            ) {
                return null;
            }
            if (isTableVisualizationConfig(visualizationConfig)) {
                if (!canExportCsv) return null;
                return {
                    key: 'chart',
                    label: 'Chart data',
                    disabled,
                    content: (
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
                                getGsheetLink === undefined || isEmbedded
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
                    ),
                };
            }
            if (!canExportImages) return null;
            return {
                key: 'chart',
                label: 'Chart image',
                disabled,
                content: chartRef.current ? (
                    <ChartDownloadOptions getChartInstance={getChartInstance} />
                ) : (
                    <Text fz="xs" c="dimmed">
                        Open the chart to download it as an image.
                    </Text>
                ),
            };
        };

        const chartPart = getChartPart();
        return <ExportPopover parts={chartPart ? [chartPart] : []} />;
    },
);

export default ChartDownloadMenu;
