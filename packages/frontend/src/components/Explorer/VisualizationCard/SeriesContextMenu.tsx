import { Menu } from '@blueprintjs/core';
import {
    MenuItem2,
    Popover2,
    Popover2TargetProps,
} from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import { getItemMap, hasCustomDimension } from '@lightdash/common';
import { Portal } from '@mantine/core';
import React, {
    FC,
    memo,
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import CopyToClipboard from 'react-copy-to-clipboard';
import { useParams } from 'react-router-dom';
import { EChartSeries } from '../../../hooks/echarts/useEchartsCartesianConfig';
import useToaster from '../../../hooks/toaster/useToaster';
import { useExplore } from '../../../hooks/useExplore';
import { useApp } from '../../../providers/AppProvider';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { Can } from '../../common/Authorization';
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

    const { track } = useTracking();
    const { user } = useApp();
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

    const onViewUnderlyingData = useCallback(() => {
        if (underlyingData !== undefined) {
            openUnderlyingDataModal({
                ...underlyingData,
                dimensions,
            });
        }
    }, [openUnderlyingDataModal, dimensions, underlyingData]);
    const contextMenuRenderTarget = useCallback(
        ({ ref }: Popover2TargetProps) => (
            <Portal>
                <div
                    style={{ position: 'absolute', ...contextMenuTargetOffset }}
                    ref={ref}
                />
            </Portal>
        ),
        [contextMenuTargetOffset],
    );

    const cancelContextMenu = useCallback(
        (e: React.SyntheticEvent<HTMLDivElement>) => e.preventDefault(),
        [],
    );

    const onClose = useCallback(() => setContextMenuIsOpen(false), []);

    return (
        <Popover2
            content={
                <div onContextMenu={cancelContextMenu}>
                    <Menu>
                        <Can
                            I="view"
                            this={subject('UnderlyingData', {
                                organizationUuid: user.data?.organizationUuid,
                                projectUuid: projectUuid,
                            })}
                        >
                            {!hasCustomDimension(metricQuery) && (
                                <MenuItem2
                                    text={`View underlying data`}
                                    icon={'layers'}
                                    onClick={() => {
                                        onViewUnderlyingData();
                                        track({
                                            name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
                                            properties: {
                                                organizationId:
                                                    user?.data
                                                        ?.organizationUuid,
                                                userId: user?.data?.userUuid,
                                                projectId: projectUuid,
                                            },
                                        });
                                    }}
                                />
                            )}
                        </Can>
                        {underlyingData?.value && (
                            <CopyToClipboard
                                text={underlyingData.value.formatted}
                                onCopy={() => {
                                    showToastSuccess({
                                        title: 'Copied to clipboard!',
                                    });
                                }}
                            >
                                <MenuItem2 text="Copy value" icon="duplicate" />
                            </CopyToClipboard>
                        )}
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
                                    organizationId:
                                        user?.data?.organizationUuid,
                                    userId: user?.data?.userUuid,
                                    projectId: projectUuid,
                                }}
                            />
                        </Can>
                    </Menu>
                </div>
            }
            enforceFocus={false}
            hasBackdrop={true}
            isOpen={contextMenuIsOpen}
            minimal={true}
            onClose={onClose}
            placement="right-start"
            positioningStrategy="fixed"
            rootBoundary={'viewport'}
            renderTarget={contextMenuRenderTarget}
            transitionDuration={100}
        />
    );
});
