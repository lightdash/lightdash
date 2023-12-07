import { subject } from '@casl/ability';
import { getItemMap, hasCustomDimension } from '@lightdash/common';
import { Menu, Portal } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy, IconStack } from '@tabler/icons-react';
import { FC, memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { EChartSeries } from '../../../hooks/echarts/useEchartsCartesianConfig';
import useToaster from '../../../hooks/toaster/useToaster';
import { useExplore } from '../../../hooks/useExplore';
import { useApp } from '../../../providers/AppProvider';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { Can } from '../../common/Authorization';
import MantineIcon from '../../common/MantineIcon';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import DrillDownMenuItem from '../../MetricQueryData/DrillDownMenuItem';
import {
    getDataFromChartClick,
    useMetricQueryDataContext,
} from '../../MetricQueryData/MetricQueryDataProvider';
import { EchartSeriesClickEvent } from '../../SimpleChart';

export const SeriesContextMenu: FC<{
    echartSeriesClickEvent: EchartSeriesClickEvent | undefined;
    dimensions: string[] | undefined;
    series: EChartSeries[] | undefined;
}> = memo(({ echartSeriesClickEvent, dimensions, series }) => {
    const { showToastSuccess } = useToaster();
    const clipboard = useClipboard({ timeout: 200 });
    const { track } = useTracking();
    const { user } = useApp();

    const tableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const { data: explore } = useExplore(tableName);
    const context = useVisualizationContext();
    const { resultsData: { metricQuery } = {} } = context;

    const [contextMenuIsOpen, setContextMenuIsOpen] = useState(false);
    const { openUnderlyingDataModal } = useMetricQueryDataContext();

    const [contextMenuTargetOffset, setContextMenuTargetOffset] = useState<{
        left: number;
        top: number;
    }>();

    const { projectUuid } = useParams<{ projectUuid: string }>();

    useEffect(() => {
        if (echartSeriesClickEvent !== undefined) {
            const e: EchartSeriesClickEvent = echartSeriesClickEvent;

            setContextMenuIsOpen(true);
            setContextMenuTargetOffset({
                left: e.event.event.pageX,
                top: e.event.event.pageY,
            });
        }
    }, [echartSeriesClickEvent]);

    const underlyingData = useMemo(() => {
        if (explore !== undefined && echartSeriesClickEvent !== undefined) {
            const allItemsMap = getItemMap(
                explore,
                metricQuery?.additionalMetrics,
                metricQuery?.tableCalculations,
            );

            return getDataFromChartClick(
                echartSeriesClickEvent,
                allItemsMap,
                series || [],
            );
        }
    }, [echartSeriesClickEvent, explore, metricQuery, series]);

    const handleCopyToClipboard = useCallback(() => {
        if (underlyingData === undefined) return;
        const value = underlyingData.value.formatted;

        clipboard.copy(value);
        showToastSuccess({ title: 'Copied to clipboard!' });
    }, [underlyingData, clipboard, showToastSuccess]);

    const handleViewUnderlyingData = useCallback(() => {
        if (underlyingData === undefined) return;

        track({
            name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
            properties: {
                organizationId: user?.data?.organizationUuid,
                userId: user?.data?.userUuid,
                projectId: projectUuid,
            },
        });

        openUnderlyingDataModal({
            ...underlyingData,
            dimensions,
        });
    }, [
        underlyingData,
        dimensions,
        openUnderlyingDataModal,
        track,
        user?.data?.organizationUuid,
        user?.data?.userUuid,
        projectUuid,
    ]);

    const handleCancelContextMenu = useCallback(
        (e: React.SyntheticEvent<HTMLDivElement>) => e.preventDefault(),
        [],
    );

    const onClose = useCallback(() => setContextMenuIsOpen(false), []);

    return (
        <Menu
            opened={contextMenuIsOpen}
            onClose={onClose}
            withinPortal
            closeOnItemClick
            closeOnEscape
            shadow="md"
            radius={0}
            position="right-start"
            offset={{
                mainAxis: 0,
                crossAxis: 0,
            }}
        >
            <Portal>
                <Menu.Target>
                    <div
                        onContextMenu={handleCancelContextMenu}
                        style={{
                            position: 'absolute',
                            ...contextMenuTargetOffset,
                        }}
                    />
                </Menu.Target>
            </Portal>

            <Menu.Dropdown>
                {underlyingData?.value && (
                    <Menu.Item
                        icon={<MantineIcon icon={IconCopy} />}
                        onClick={handleCopyToClipboard}
                    >
                        Copy value
                    </Menu.Item>
                )}

                <Can
                    I="view"
                    this={subject('UnderlyingData', {
                        organizationUuid: user.data?.organizationUuid,
                        projectUuid: projectUuid,
                    })}
                >
                    {!hasCustomDimension(metricQuery) && (
                        <Menu.Item
                            icon={<MantineIcon icon={IconStack} />}
                            onClick={handleViewUnderlyingData}
                        >
                            View underlying data
                        </Menu.Item>
                    )}
                </Can>

                <Can
                    I="view"
                    this={subject('Explore', {
                        organizationUuid: user.data?.organizationUuid,
                        projectUuid: projectUuid,
                    })}
                >
                    <DrillDownMenuItem
                        {...underlyingData}
                        trackingData={{
                            organizationId: user?.data?.organizationUuid,
                            userId: user?.data?.userUuid,
                            projectId: projectUuid,
                        }}
                    />
                </Can>
            </Menu.Dropdown>
        </Menu>
    );
});
