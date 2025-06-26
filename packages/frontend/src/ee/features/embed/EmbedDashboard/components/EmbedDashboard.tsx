import {
    assertUnreachable,
    DashboardTileTypes,
    getItemId,
} from '@lightdash/common';
import { IconUnlink } from '@tabler/icons-react';
import { useEffect, useMemo, type FC } from 'react';
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout';
import {
    getReactGridLayoutConfig,
    getResponsiveGridLayoutProps,
} from '../../../../../components/DashboardTabs/gridUtils';
import LoomTile from '../../../../../components/DashboardTiles/DashboardLoomTile';
import SqlChartTile from '../../../../../components/DashboardTiles/DashboardSqlChartTile';
import SuboptimalState from '../../../../../components/common/SuboptimalState/SuboptimalState';
import { LockedDashboardModal } from '../../../../../components/common/modal/LockedDashboardModal';
import useDashboardContext from '../../../../../providers/Dashboard/useDashboardContext';
import useEmbed from '../../../../providers/Embed/useEmbed';
import { useEmbedDashboard } from '../hooks';
import EmbedDashboardChartTile from './EmbedDashboardChartTile';
import EmbedDashboardHeader from './EmbedDashboardHeader';

import '../../../../../styles/react-grid.css';
import { convertSdkFilterToDashboardFilter } from '../utils';
import { EmbedMarkdownTile } from './EmbedMarkdownTile';

const ResponsiveGridLayout = WidthProvider(Responsive);

const EmbedDashboard: FC<{
    containerStyles?: React.CSSProperties;
}> = ({ containerStyles }) => {
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );

    const { embedToken, filters } = useEmbed();

    const sdkDashboardFilters = useMemo(() => {
        if (
            !filters ||
            filters.length === 0 ||
            Object.keys(allFilterableFieldsMap).length === 0
        ) {
            return undefined;
        }

        const dimensionFilters = filters
            ?.map((filter) => {
                const fieldId = getItemId({
                    table: filter.model,
                    name: filter.field,
                });

                const field = allFilterableFieldsMap[fieldId];

                if (!field) {
                    console.warn(`Field ${filter.field} not found`, filter);
                    console.warn(
                        `Here are all the fields:`,
                        allFilterableFieldsMap,
                    );
                    return null;
                }

                return convertSdkFilterToDashboardFilter(filter);
            })
            .filter((filter) => filter !== null);

        if (!dimensionFilters) {
            return undefined;
        }

        return {
            dimensions: dimensionFilters,
            metrics: [],
            tableCalculations: [],
        };
    }, [filters, allFilterableFieldsMap]);

    useEffect(() => {
        if (sdkDashboardFilters) {
            setDashboardFilters(sdkDashboardFilters);
        }
    }, [sdkDashboardFilters, setDashboardFilters]);

    if (!embedToken) {
        throw new Error('Embed token is required');
    }

    const { data: dashboard, error: dashboardError } = useEmbedDashboard(
        projectUuid,
        embedToken,
    );

    const setEmbedDashboard = useDashboardContext((c) => c.setEmbedDashboard);
    useEffect(() => {
        if (dashboard) {
            setEmbedDashboard(dashboard);
        }
    }, [dashboard, setEmbedDashboard]);
    const requiredDashboardFilters = useDashboardContext(
        (c) => c.requiredDashboardFilters,
    );

    const hasRequiredDashboardFiltersToSet =
        requiredDashboardFilters.length > 0;
    const hasChartTiles =
        useMemo(
            () =>
                dashboard?.tiles.some(
                    (tile) => tile.type === DashboardTileTypes.SAVED_CHART,
                ),
            [dashboard],
        ) || false;

    if (!projectUuid) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState title="Missing project UUID" />
            </div>
        );
    }
    if (dashboardError) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    title="Error loading dashboard"
                    icon={IconUnlink}
                    description={
                        dashboardError.error.message.includes('jwt expired')
                            ? 'This embed link has expired'
                            : dashboardError.error.message
                    }
                />
            </div>
        );
    }

    if (!dashboard) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState title="Loading..." loading />
            </div>
        );
    }

    if (dashboard.tiles.length === 0) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    title="Empty dashboard"
                    description="This dashboard has no tiles"
                />
            </div>
        );
    }

    const layouts = {
        lg: dashboard.tiles.map<Layout>((tile) =>
            getReactGridLayoutConfig(tile),
        ),
    };
    return (
        <div style={containerStyles ?? { height: '100vh', overflowY: 'auto' }}>
            <EmbedDashboardHeader
                dashboard={dashboard}
                projectUuid={projectUuid}
            />

            <LockedDashboardModal
                opened={hasRequiredDashboardFiltersToSet && !!hasChartTiles}
            />
            <ResponsiveGridLayout
                {...getResponsiveGridLayoutProps({ enableAnimation: false })}
                layouts={layouts}
                className={`react-grid-layout-dashboard ${
                    hasRequiredDashboardFiltersToSet ? 'locked' : ''
                }`}
            >
                {dashboard.tiles.map((tile, index) => (
                    <div key={tile.uuid}>
                        {tile.type === DashboardTileTypes.SAVED_CHART ? (
                            <EmbedDashboardChartTile
                                projectUuid={projectUuid}
                                dashboardSlug={dashboard.slug}
                                embedToken={embedToken}
                                key={tile.uuid}
                                minimal
                                tile={tile}
                                isEditMode={false}
                                onDelete={() => {}}
                                onEdit={() => {}}
                                canExportCsv={dashboard.canExportCsv}
                                canExportImages={dashboard.canExportImages}
                                locked={hasRequiredDashboardFiltersToSet}
                                tileIndex={index}
                            />
                        ) : tile.type === DashboardTileTypes.MARKDOWN ? (
                            <EmbedMarkdownTile
                                key={tile.uuid}
                                tile={tile}
                                isEditMode={false}
                                onDelete={() => {}}
                                onEdit={() => {}}
                                tileIndex={index}
                                dashboardSlug={dashboard.slug}
                            />
                        ) : tile.type === DashboardTileTypes.LOOM ? (
                            <LoomTile
                                key={tile.uuid}
                                tile={tile}
                                isEditMode={false}
                                onDelete={() => {}}
                                onEdit={() => {}}
                            />
                        ) : tile.type === DashboardTileTypes.SQL_CHART ? (
                            <SqlChartTile
                                key={tile.uuid}
                                tile={tile}
                                isEditMode={false}
                                onDelete={() => {}}
                                onEdit={() => {}}
                            />
                        ) : (
                            assertUnreachable(
                                tile,
                                `Dashboard tile type is not recognised`,
                            )
                        )}
                    </div>
                ))}
            </ResponsiveGridLayout>
        </div>
    );
};

export default EmbedDashboard;
