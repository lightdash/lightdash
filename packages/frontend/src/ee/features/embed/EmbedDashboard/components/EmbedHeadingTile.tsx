import DashboardHeadingTile, {
    type Props as HeadingTileProps,
} from '../../../../../components/DashboardTiles/DashboardHeadingTile';
import { useTranslatedTile } from '../hooks/useTranslatedTile';

export const EmbedHeadingTile: React.FC<
    HeadingTileProps & { tileIndex: number; dashboardSlug: string }
> = ({ tileIndex, dashboardSlug, ...props }) => {
    const translatedTile = useTranslatedTile(
        props.tile,
        dashboardSlug,
        tileIndex,
    );

    return <DashboardHeadingTile {...props} tile={translatedTile} />;
};
