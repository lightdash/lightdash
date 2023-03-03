import { NonIdealState } from '@blueprintjs/core';
import { DashboardTileTypes } from '@lightdash/common';
import React, { FC, memo, useMemo } from 'react';
import { Layout, Responsive, WidthProvider } from 'react-grid-layout';
import ChartTile from '../components/DashboardTiles/DashboardChartTile';
import LoomTile from '../components/DashboardTiles/DashboardLoomTile';
import MarkdownTile from '../components/DashboardTiles/DashboardMarkdownTile';
import TileBase from '../components/DashboardTiles/TileBase/index';
import DrillDownModal from '../components/MetricQueryData/DrillDownModal';
import MetricQueryDataProvider from '../components/MetricQueryData/MetricQueryDataProvider';
import UnderlyingDataModal from '../components/MetricQueryData/UnderlyingDataModal';
import { useSavedQuery } from '../hooks/useSavedQuery';
import { useDashboardContext } from '../providers/DashboardProvider';
import '../styles/react-grid.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

const GridTile: FC<
    Pick<
        React.ComponentProps<typeof TileBase>,
        'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
    >
> = memo((props) => {
    const { tile } = props;

    const savedChartUuid: string | undefined =
        tile.type === DashboardTileTypes.SAVED_CHART
            ? tile.properties?.savedChartUuid || undefined
            : undefined;
    const {
        data: savedQuery,
        isLoading,
        isError,
    } = useSavedQuery({
        id: savedChartUuid,
    });

    switch (tile.type) {
        case DashboardTileTypes.SAVED_CHART:
            if (isLoading)
                return (
                    <TileBase
                        isLoading={true}
                        title={''}
                        {...props}
                        clickableTitle={false}
                    />
                );
            if (isError)
                return (
                    <TileBase title={''} {...props} clickableTitle={false}>
                        <NonIdealState
                            icon="lock"
                            title={`You don't have access to view this chart`}
                        ></NonIdealState>
                    </TileBase>
                );
            return (
                <MetricQueryDataProvider
                    metricQuery={savedQuery?.metricQuery}
                    tableName={savedQuery?.tableName || ''}
                >
                    <ChartTile {...props} tile={tile} />
                    <UnderlyingDataModal />
                    <DrillDownModal />
                </MetricQueryDataProvider>
            );
        case DashboardTileTypes.MARKDOWN:
            return <MarkdownTile {...props} tile={tile} />;
        case DashboardTileTypes.LOOM:
            return <LoomTile {...props} tile={tile} />;
        default: {
            const never: never = tile;
            throw new Error(
                `Dashboard tile type "${props.tile.type}" not recognised`,
            );
        }
    }
});

const MinimalDashboard = () => {
    const { dashboard, dashboardError, dashboardTiles } = useDashboardContext();

    const layouts = useMemo(
        () => ({
            lg: dashboardTiles.map<Layout>((tile) => ({
                minH: 2,
                minW: 6,
                x: tile.x,
                y: tile.y,
                w: tile.w,
                h: tile.h,
                i: tile.uuid,
                isDraggable: false,
                isResizable: false,
            })),
        }),
        [dashboardTiles],
    );

    if (dashboardError) {
        return <>{dashboardError.error}</>;
    }

    if (dashboard === undefined) {
        return <>Loading...</>;
    }

    if (dashboardTiles.length === 0) {
        return <>No tiles</>;
    }

    return (
        <ResponsiveGridLayout
            useCSSTransforms={false}
            draggableCancel=".non-draggable"
            breakpoints={{ lg: 1200, md: 996, sm: 768 }}
            cols={{ lg: 36, md: 30, sm: 18 }}
            rowHeight={50}
            layouts={layouts}
        >
            {dashboardTiles.map((tile) => (
                <div key={tile.uuid}>
                    test
                    {/* <GridTile isEditMode={isEditMode} tile={tile} /> */}
                </div>
            ))}
        </ResponsiveGridLayout>
    );
};

export default MinimalDashboard;
