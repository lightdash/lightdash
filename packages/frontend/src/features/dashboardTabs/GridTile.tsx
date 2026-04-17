import {
    assertUnreachable,
    DashboardTileTypes,
    type DashboardTab,
    type Dashboard as IDashboard,
} from '@lightdash/common';
import { Box, Skeleton } from '@mantine-8/core';
import { memo, type FC } from 'react';
import ChartTile from '../../components/DashboardTiles/DashboardChartTile';
import HeadingTile from '../../components/DashboardTiles/DashboardHeadingTile';
import LoomTile from '../../components/DashboardTiles/DashboardLoomTile';
import MarkdownTile from '../../components/DashboardTiles/DashboardMarkdownTile';
import SqlChartTile from '../../components/DashboardTiles/DashboardSqlChartTile';
import TileBase from '../../components/DashboardTiles/TileBase';
import ErrorBoundary from '../errorBoundary/ErrorBoundary';
import { useStagedMount } from './stagedMountContext';

type GridTileProps = Pick<
    React.ComponentProps<typeof TileBase>,
    'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
> & {
    index: number;
    tabs?: DashboardTab[];
    onAddTiles: (tiles: IDashboard['tiles'][number][]) => Promise<void>;
    locked: boolean;
};

const GridTileInner: FC<GridTileProps> = memo((props) => {
    const { tile } = props;

    if (props.locked) {
        // Allow markdown, loom, and heading tiles to show even when locked since they are not filterable
        if (tile.type === DashboardTileTypes.MARKDOWN) {
            return <MarkdownTile {...props} tile={tile} />;
        }
        if (tile.type === DashboardTileTypes.LOOM) {
            return <LoomTile {...props} tile={tile} />;
        }
        if (tile.type === DashboardTileTypes.HEADING) {
            return <HeadingTile {...props} tile={tile} />;
        }

        return (
            <Box h="100%">
                <TileBase isLoading={false} title={''} {...props} />
            </Box>
        );
    }

    switch (tile.type) {
        case DashboardTileTypes.SAVED_CHART:
            return <ChartTile {...props} tile={tile} />;
        case DashboardTileTypes.MARKDOWN:
            return <MarkdownTile {...props} tile={tile} />;
        case DashboardTileTypes.LOOM:
            return <LoomTile {...props} tile={tile} />;
        case DashboardTileTypes.SQL_CHART:
            return <SqlChartTile {...props} tile={tile} />;
        case DashboardTileTypes.HEADING:
            return <HeadingTile {...props} tile={tile} />;
        default: {
            return assertUnreachable(
                tile,
                `Dashboard tile type "${props.tile.type}" not recognised`,
            );
        }
    }
});

const GridTile: FC<GridTileProps> = (props) => (
    <ErrorBoundary wrapper={{ h: '100%', w: '100%' }}>
        <GridTileInner {...props} />
    </ErrorBoundary>
);

/**
 * Wrapper that defers rendering of the real GridTile until the staged
 * mount cascade reaches this tile's index. Shows a skeleton placeholder
 * until then, matching the tile's dimensions via the grid layout.
 */
export const StagedGridTile: FC<GridTileProps & { stageIndex: number }> = memo(
    ({ stageIndex, ...props }) => {
        const { isReady } = useStagedMount(stageIndex);

        if (!isReady) {
            return <Skeleton h="100%" w="100%" radius="sm" />;
        }

        return <GridTile {...props} />;
    },
);

export default GridTile;
