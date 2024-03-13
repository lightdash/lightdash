import {
    assertUnreachable,
    ChartType,
    ECHARTS_DEFAULT_COLORS,
    ProjectType,
} from '@lightdash/common';
import { Box, Group, Text } from '@mantine/core';
import { FC, memo, useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import useDashboardStorage from '../../../hooks/dashboard/useDashboardStorage';
import { EChartSeries } from '../../../hooks/echarts/useEchartsCartesianConfig';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useProjects } from '../../../hooks/useProjects';
import { useApp } from '../../../providers/AppProvider';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import VisualizationProvider from '../../LightdashVisualization/VisualizationProvider';
import { EchartSeriesClickEvent } from '../../SimpleChart';
import BigNumberConfigTabs from '../../VisualizationConfigs/BigNumberConfig/BigNumberConfigTabs';
import ChartConfigTabs from '../../VisualizationConfigs/ChartConfigPanel/ChartConfigTabs';
import CustomVisConfigTabs from '../../VisualizationConfigs/ChartConfigPanel/CustomVisConfigTabs';
import PieChartConfigTabs from '../../VisualizationConfigs/PieChartConfig/PieChartConfigTabs';
import TableConfigTabs from '../../VisualizationConfigs/TableConfigPanel/TableConfigTabs';
import VisualizationCardOptions from '../VisualizationCardOptions';
import { EchartsClickEvent } from './VisualizationCard';

export const VisualizationSidebarRight: FC = memo(() => {
    const { health } = useApp();
    const { data: org } = useOrganization();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: projects } = useProjects({ refetchOnMount: false });
    const isProjectPreview = !!projects?.find(
        (project) =>
            project.projectUuid === projectUuid &&
            project.type === ProjectType.PREVIEW,
    );
    const isEditingDashboardChart =
        !!useDashboardStorage().getIsEditingDashboardChart();

    const savedChart = useExplorerContext(
        (context) => context.state.savedChart,
    );
    const unsavedChartVersion = useExplorerContext(
        (context) => context.state.unsavedChartVersion,
    );
    const queryResults = useExplorerContext(
        (context) => context.queryResults.data,
    );
    const isLoadingQueryResults = useExplorerContext(
        (context) => context.queryResults.isLoading,
    );
    const chartType = useExplorerContext(
        (context) => context.state.unsavedChartVersion.chartConfig.type,
    );

    const setPivotFields = useExplorerContext(
        (context) => context.actions.setPivotFields,
    );
    const setChartType = useExplorerContext(
        (context) => context.actions.setChartType,
    );
    const setChartConfig = useExplorerContext(
        (context) => context.actions.setChartConfig,
    );

    const isEditMode = useExplorerContext(
        (context) => context.state.isEditMode,
    );

    const [, setEchartsClickEvent] = useState<EchartsClickEvent>();

    const onSeriesContextMenu = useCallback(
        (e: EchartSeriesClickEvent, series: EChartSeries[]) => {
            setEchartsClickEvent({
                event: e,
                dimensions: unsavedChartVersion.metricQuery.dimensions,
                series,
            });
        },
        [unsavedChartVersion],
    );
    const sidebarVerticalOffset =
        (isProjectPreview && !isEditingDashboardChart ? 35 : 0) + // Preview header
        (isEditingDashboardChart ? 35 : 50) + // Normal header or dashboardChart header
        (savedChart === undefined ? 0 : 80); // Include the saved chart header or not

    const ConfigTab = useMemo(() => {
        switch (chartType) {
            case ChartType.BIG_NUMBER:
                return BigNumberConfigTabs;
            case ChartType.TABLE:
                return TableConfigTabs;
            case ChartType.CARTESIAN:
                return ChartConfigTabs;
            case ChartType.PIE:
                return PieChartConfigTabs;
            case ChartType.CUSTOM:
                return CustomVisConfigTabs;
            default:
                return assertUnreachable(
                    chartType,
                    `Chart type ${chartType} not supported`,
                );
        }
    }, [chartType]);

    if (health.isInitialLoading || !health.data) {
        return null;
    }

    return (
        <VisualizationProvider
            chartConfig={unsavedChartVersion.chartConfig}
            initialPivotDimensions={unsavedChartVersion.pivotConfig?.columns}
            resultsData={queryResults}
            isLoading={isLoadingQueryResults}
            columnOrder={unsavedChartVersion.tableConfig.columnOrder}
            onSeriesContextMenu={onSeriesContextMenu}
            pivotTableMaxColumnLimit={health.data.pivotTable.maxColumnLimit}
            savedChartUuid={isEditMode ? undefined : savedChart?.uuid}
            onChartConfigChange={setChartConfig}
            onChartTypeChange={setChartType}
            onPivotDimensionsChange={setPivotFields}
            colorPalette={org?.chartColors ?? ECHARTS_DEFAULT_COLORS}
        >
            <Box
                w={410}
                styles={(theme) => ({
                    inner: {
                        top: sidebarVerticalOffset,
                        height: `calc(100% - ${sidebarVerticalOffset}px)`,
                    },
                    content: {
                        display: 'flex',
                        flexDirection: 'column',
                    },
                    header: {
                        borderBottom: `1px solid ${theme.colors.gray[4]}`,
                        borderTop: `1px solid ${theme.colors.gray[2]}`,
                        flexShrink: 0,
                    },
                    body: {
                        flexGrow: 1,
                        display: 'flex',
                        flexDirection: 'column',
                    },
                })}
            >
                <Text fw={600}>Configure chart</Text>
                <Group py="lg">
                    <Text fw={600}>Chart type</Text>
                    <VisualizationCardOptions />
                </Group>

                <ConfigTab />
            </Box>
        </VisualizationProvider>
    );
});
