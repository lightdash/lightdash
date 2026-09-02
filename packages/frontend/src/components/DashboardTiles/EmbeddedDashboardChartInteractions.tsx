import {
    type DashboardFilterRule,
    type EChartsSeries,
    type SavedChart,
} from '@lightdash/common';
import { Menu, Portal } from '@mantine/core';
import React, { useCallback, useState, type FC, type ReactNode } from 'react';
import { type EmbedExploreOptions } from '../../ee/providers/Embed/types';
import { FilterDashboardTo } from '../../features/dashboardFilters/FilterDashboardTo';
import { type DashboardChartReadyQuery } from '../../hooks/dashboard/useDashboardChartReadyQuery';
import { useContextMenuPermissions } from '../../hooks/useContextMenuPermissions';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { type EmbeddedDashboardInteractivity } from '../LightdashVisualization/context';
import DrillDownMenuItem from '../MetricQueryData/DrillDownMenuItem';
import { useMetricQueryDataContext } from '../MetricQueryData/useMetricQueryDataContext';
import { type EchartsSeriesClickEvent } from '../SimpleChart';
import {
    getAppliedTileDateZoom,
    type AppliedTileDateZoomArgs,
} from './getAppliedTileDateZoom';
import {
    getDashboardTileContextMenuOptions,
    shouldOpenEmbeddedChartContextMenu,
} from './getDashboardTileContextMenuOptions';
import { UnderlyingDataMenuItem } from './UnderlyingDataMenuItem';

export type EmbeddedDashboardInteractions = EmbeddedDashboardInteractivity & {
    onDrillDownExplore?: (options: EmbedExploreOptions) => void;
};

type Props = {
    tileUuid: string;
    isEditMode: boolean;
    chart: SavedChart;
    explore: DashboardChartReadyQuery['explore'];
    dateZoom: DashboardChartReadyQuery['dateZoom'];
    dateDimension: AppliedTileDateZoomArgs['dateDimension'];
    interactions: EmbeddedDashboardInteractions;
    children: (
        onSeriesContextMenu: (
            event: EchartsSeriesClickEvent,
            series: EChartsSeries[],
        ) => void,
    ) => ReactNode;
};

const EmbeddedDashboardChartInteractions: FC<Props> = ({
    tileUuid,
    isEditMode,
    chart,
    explore,
    dateZoom,
    dateDimension,
    interactions,
    children,
}) => {
    const [contextMenuIsOpen, setContextMenuIsOpen] = useState(false);
    const [contextMenuTargetOffset, setContextMenuTargetOffset] = useState<{
        left: number;
        top: number;
    }>();
    const [contextMenuOptions, setContextMenuOptions] =
        useState<ReturnType<typeof getDashboardTileContextMenuOptions>>();
    const projectUuid = useProjectUuid();
    const { canViewUnderlyingData } = useContextMenuPermissions({
        organizationUuid: chart.organizationUuid,
        projectUuid: chart.projectUuid,
    });
    const tilesWithDateZoomApplied = useDashboardContext(
        (context) => context.tilesWithDateZoomApplied,
    );
    const addDimensionDashboardFilter = useDashboardContext(
        (context) => context.addDimensionDashboardFilter,
    );
    const { openUnderlyingDataModal } = useMetricQueryDataContext();

    const handleAddFilter = useCallback(
        (filter: DashboardFilterRule) => {
            addDimensionDashboardFilter(filter, !isEditMode);
        },
        [addDimensionDashboardFilter, isEditMode],
    );

    const handleViewUnderlyingData = useCallback(() => {
        if (!contextMenuOptions) return;

        const appliedDateZoom = getAppliedTileDateZoom({
            tileUuid,
            tilesWithDateZoomApplied,
            dateZoom,
            dateDimension,
        });

        openUnderlyingDataModal({
            ...contextMenuOptions.viewUnderlyingDataOptions,
            ...(appliedDateZoom?.xAxisFieldId && {
                dateZoom: appliedDateZoom,
            }),
        });
    }, [
        contextMenuOptions,
        dateDimension,
        dateZoom,
        openUnderlyingDataModal,
        tileUuid,
        tilesWithDateZoomApplied,
    ]);

    const onSeriesContextMenu = useCallback(
        (event: EchartsSeriesClickEvent, series: EChartsSeries[]) => {
            if (!explore) return;

            const options = getDashboardTileContextMenuOptions({
                clickEvent: event,
                series,
                explore,
                chart,
            });

            if (
                !shouldOpenEmbeddedChartContextMenu({
                    canViewUnderlyingData,
                    canExplore: interactions.canDrillDown,
                    canCrossFilter: interactions.canCrossFilter,
                    dashboardTileFilterOptionsCount:
                        options.dashboardTileFilterOptions.length,
                })
            ) {
                setContextMenuIsOpen(false);
                return;
            }

            setContextMenuOptions(options);
            setContextMenuIsOpen(true);
            setContextMenuTargetOffset({
                left: event.event.event.pageX,
                top: event.event.event.pageY,
            });
        },
        [canViewUnderlyingData, chart, explore, interactions],
    );

    return (
        <>
            <Menu
                opened={contextMenuIsOpen}
                onClose={() => setContextMenuIsOpen(false)}
                closeOnItemClick
                closeOnEscape
                radius={0}
                position="bottom-start"
                offset={{ crossAxis: 0, mainAxis: 0 }}
            >
                <Portal>
                    <Menu.Target>
                        <div
                            onContextMenu={(event) => event.preventDefault()}
                            style={{
                                position: 'absolute',
                                ...contextMenuTargetOffset,
                            }}
                        />
                    </Menu.Target>
                </Portal>
                <Menu.Dropdown>
                    {canViewUnderlyingData && (
                        <UnderlyingDataMenuItem
                            metricQuery={chart.metricQuery}
                            onViewUnderlyingData={handleViewUnderlyingData}
                        />
                    )}
                    {interactions.canDrillDown && (
                        <DrillDownMenuItem
                            {...contextMenuOptions?.viewUnderlyingDataOptions}
                            trackingData={{
                                organizationId: chart.organizationUuid,
                                userId: undefined,
                                projectId: projectUuid,
                            }}
                        />
                    )}
                    {interactions.canCrossFilter &&
                        contextMenuOptions &&
                        contextMenuOptions.dashboardTileFilterOptions.length >
                            0 && (
                            <FilterDashboardTo
                                filters={
                                    contextMenuOptions.dashboardTileFilterOptions
                                }
                                onAddFilter={handleAddFilter}
                            />
                        )}
                </Menu.Dropdown>
            </Menu>
            {children(onSeriesContextMenu)}
        </>
    );
};

export default EmbeddedDashboardChartInteractions;
