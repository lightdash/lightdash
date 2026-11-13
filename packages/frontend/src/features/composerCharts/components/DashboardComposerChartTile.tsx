import { type DashboardComposerChartTile as ComposerChartTile } from '@lightdash/common';
import { IconChartDots3 } from '@tabler/icons-react';
import { useEffect, type ComponentProps, type FC } from 'react';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import TileBase from '../../../components/DashboardTiles/TileBase/index';
import { useUiString } from '../../../ee/providers/Embed/useUiStrings';
import useDashboardTileStatusContext from '../../../providers/Dashboard/useDashboardTileStatusContext';

type Props = Pick<
    ComponentProps<typeof TileBase>,
    'onEdit' | 'onDelete' | 'isEditMode' | 'minimal' | 'tabs'
> & { tile: ComposerChartTile };

/** Composer charts cannot render yet; the tile holds its place and reports ready. */
const DashboardComposerChartTile: FC<Props> = (props) => {
    const { tile } = props;
    const notAvailable = useUiString('tile.composerChart.notAvailable');
    const markTileScreenshotReady = useDashboardTileStatusContext(
        (c) => c.markTileScreenshotReady,
    );

    useEffect(() => {
        markTileScreenshotReady(tile.uuid);
    }, [markTileScreenshotReady, tile.uuid]);

    return (
        <TileBase
            {...props}
            title={tile.properties.title || tile.properties.chartName || ''}
            chartName={tile.properties.chartName ?? undefined}
        >
            <SuboptimalState
                adaptive
                icon={IconChartDots3}
                description={notAvailable}
                data-testid="composer-chart-not-available"
            />
        </TileBase>
    );
};

export default DashboardComposerChartTile;
