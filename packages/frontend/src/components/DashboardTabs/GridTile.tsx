import {
    assertUnreachable,
    DashboardTileTypes,
    type Dashboard as IDashboard,
    type DashboardTab,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import { useProfiler } from '@sentry/react';
import { memo, type FC } from 'react';
import ChartTile from '../DashboardTiles/DashboardChartTile';
import LoomTile from '../DashboardTiles/DashboardLoomTile';
import MarkdownTile from '../DashboardTiles/DashboardMarkdownTile';
import SemanticViewerChartTile from '../DashboardTiles/DashboardSemanticViewerChartTile';
import SqlChartTile from '../DashboardTiles/DashboardSqlChartTile';
import TileBase from '../DashboardTiles/TileBase';

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
    useProfiler(`Dashboard-${tile.type}`);

    if (props.locked) {
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
        case DashboardTileTypes.SEMANTIC_VIEWER_CHART:
            return <SemanticViewerChartTile {...props} tile={tile} />;
        default: {
            return assertUnreachable(
                tile,
                `Dashboard tile type "${props.tile.type}" not recognised`,
            );
        }
    }
});

export default GridTile;
