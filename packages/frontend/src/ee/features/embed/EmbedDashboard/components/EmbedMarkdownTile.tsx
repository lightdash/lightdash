import DashboardMarkdownTile, {
    type Props as MarkdownTileProps,
} from '../../../../../components/DashboardTiles/DashboardMarkdownTile';
import { useTranslatedTile } from '../hooks/useTranslatedTile';

export const EmbedMarkdownTile: React.FC<
    MarkdownTileProps & { tileIndex: number; dashboardSlug: string }
> = ({ tileIndex, dashboardSlug, ...props }) => {
    const translatedTile = useTranslatedTile(
        props.tile,
        dashboardSlug,
        tileIndex,
    );

    return <DashboardMarkdownTile {...props} tile={translatedTile} />;
};
