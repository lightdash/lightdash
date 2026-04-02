import {
    assertUnreachable,
    DashboardTileTypes,
    type DashboardTab,
    type Dashboard as IDashboard,
} from '@lightdash/common';
import { Box, Skeleton } from '@mantine-8/core';
import { memo, useEffect, type FC } from 'react';
import ChartTile from '../../components/DashboardTiles/DashboardChartTile';
import HeadingTile from '../../components/DashboardTiles/DashboardHeadingTile';
import LoomTile from '../../components/DashboardTiles/DashboardLoomTile';
import MarkdownTile from '../../components/DashboardTiles/DashboardMarkdownTile';
import SqlChartTile from '../../components/DashboardTiles/DashboardSqlChartTile';
import TileBase from '../../components/DashboardTiles/TileBase';
import { useStagedMount } from './stagedMountContext';

const GridTile: FC<
    Pick<
        React.ComponentProps<typeof TileBase>,
        'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
    > & {
        index: number;
        tabs?: DashboardTab[];
        onAddTiles: (tiles: IDashboard['tiles'][number][]) => Promise<void>;
        locked: boolean;
    }
> = memo((props) => {
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

/**
 * Wrapper that defers rendering of the real GridTile until the staged
 * mount cascade reaches this tile's index. Shows a skeleton placeholder
 * until then, matching the tile's dimensions via the grid layout.
 */
export const StagedGridTile: FC<
    React.ComponentProps<typeof GridTile> & { stageIndex: number }
> = memo(({ stageIndex, ...props }) => {
    const { isReady } = useStagedMount(stageIndex);

    useEffect(() => {
        if (isReady) {
            console.log(
                `[StagedMount] Tile ${stageIndex} (${props.tile.uuid.slice(0, 8)}…) mounted`,
            );
        }
    }, [isReady, stageIndex, props.tile.uuid]);

    if (!isReady) {
        return <Skeleton h="100%" w="100%" radius="sm" />;
    }

    return <GridTile {...props} />;
});

export default GridTile;
