import {
    assertUnreachable,
    DASHBOARD_GRID_CLASS,
    DashboardTileTypes,
} from '@lightdash/common';
import { IconLayoutDashboard } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import ScreenshotProgressIndicator from '../../components/common/ScreenshotProgressIndicator';
import ScreenshotReadyIndicator from '../../components/common/ScreenshotReadyIndicator';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import ChartTile from '../../components/DashboardTiles/DashboardChartTile';
import DataAppTile from '../../components/DashboardTiles/DashboardDataAppTile';
import HeadingTile from '../../components/DashboardTiles/DashboardHeadingTile';
import LoomTile from '../../components/DashboardTiles/DashboardLoomTile';
import MarkdownTile from '../../components/DashboardTiles/DashboardMarkdownTile';
import SqlChartTile from '../../components/DashboardTiles/DashboardSqlChartTile';
import { getResponsiveGridLayoutProps } from '../../features/dashboardTabs/gridUtils';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../providers/Dashboard/useDashboardTileStatusContext';
import { type MinimalDashboardModel } from './minimalDashboardTypes';

const ResponsiveGridLayout = WidthProvider(Responsive);

const renderDashboardTile = (
    tile: MinimalDashboardModel['dashboard']['tiles'][number],
) => {
    switch (tile.type) {
        case DashboardTileTypes.SAVED_CHART:
            return (
                <ChartTile
                    key={tile.uuid}
                    minimal
                    tile={tile}
                    isEditMode={false}
                    onDelete={() => {}}
                    onEdit={() => {}}
                />
            );
        case DashboardTileTypes.MARKDOWN:
            return (
                <MarkdownTile
                    key={tile.uuid}
                    tile={tile}
                    isEditMode={false}
                    onDelete={() => {}}
                    onEdit={() => {}}
                />
            );
        case DashboardTileTypes.LOOM:
            return (
                <LoomTile
                    key={tile.uuid}
                    tile={tile}
                    isEditMode={false}
                    onDelete={() => {}}
                    onEdit={() => {}}
                />
            );
        case DashboardTileTypes.SQL_CHART:
            return (
                <SqlChartTile
                    key={tile.uuid}
                    tile={tile}
                    isEditMode={false}
                    onDelete={() => {}}
                    onEdit={() => {}}
                />
            );
        case DashboardTileTypes.HEADING:
            return (
                <HeadingTile
                    key={tile.uuid}
                    tile={tile}
                    isEditMode={false}
                    onDelete={() => {}}
                    onEdit={() => {}}
                />
            );
        case DashboardTileTypes.DATA_APP:
            return (
                <DataAppTile
                    key={tile.uuid}
                    tile={tile}
                    isEditMode={false}
                    onDelete={() => {}}
                    onEdit={() => {}}
                />
            );
        default:
            return assertUnreachable(
                tile,
                `Dashboard tile type is not recognised`,
            );
    }
};

type Props = {
    model: MinimalDashboardModel;
};

export const MinimalDashboardBody: FC<Props> = ({ model }) => {
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const gridProps = useMemo(
        () =>
            getResponsiveGridLayoutProps({
                stackVerticallyOnSmallestBreakpoint: true,
            }),
        [],
    );

    const isReadyForScreenshot = useDashboardTileStatusContext(
        (c) => c.isReadyForScreenshot,
    );
    const expectedScreenshotTilesCount = useDashboardTileStatusContext(
        (c) => c.expectedScreenshotTilesCount,
    );
    const screenshotReadyTilesCount = useDashboardTileStatusContext(
        (c) => c.screenshotReadyTilesCount,
    );
    const screenshotErroredTilesCount = useDashboardTileStatusContext(
        (c) => c.screenshotErroredTilesCount,
    );
    const expectedScreenshotTileUuids = useDashboardTileStatusContext(
        (c) => c.expectedScreenshotTileUuids,
    );
    const screenshotReadyTileUuids = useDashboardTileStatusContext(
        (c) => c.screenshotReadyTileUuids,
    );
    const screenshotErroredTileUuids = useDashboardTileStatusContext(
        (c) => c.screenshotErroredTileUuids,
    );

    if (!dashboardTiles) {
        return null;
    }

    return (
        <>
            {model.isTabEmpty ? (
                <SuboptimalState
                    icon={IconLayoutDashboard}
                    title="Tab is empty"
                    mt="40px"
                />
            ) : (
                <div className={DASHBOARD_GRID_CLASS}>
                    {model.tabGroups ? (
                        model.tabGroups.map((group) => (
                            <ResponsiveGridLayout
                                key={group.key}
                                {...gridProps}
                                layouts={group.layouts}
                            >
                                {group.tiles.map((tile) => (
                                    <div key={tile.uuid}>
                                        {renderDashboardTile(tile)}
                                    </div>
                                ))}
                            </ResponsiveGridLayout>
                        ))
                    ) : (
                        <ResponsiveGridLayout
                            {...gridProps}
                            layouts={model.layouts}
                        >
                            {model.filteredAndSortedDashboardTiles.map(
                                (tile) => (
                                    <div key={tile.uuid}>
                                        {renderDashboardTile(tile)}
                                    </div>
                                ),
                            )}
                        </ResponsiveGridLayout>
                    )}
                </div>
            )}

            <ScreenshotProgressIndicator
                expectedTileUuids={expectedScreenshotTileUuids}
                readyTileUuids={screenshotReadyTileUuids}
                erroredTileUuids={screenshotErroredTileUuids}
            />
            {isReadyForScreenshot && (
                <ScreenshotReadyIndicator
                    tilesTotal={expectedScreenshotTilesCount}
                    tilesReady={screenshotReadyTilesCount}
                    tilesErrored={screenshotErroredTilesCount}
                />
            )}
        </>
    );
};
