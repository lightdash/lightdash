import { useMemo } from 'react';
import DashboardMarkdownTile, {
    type Props as MarkdownTileProps,
} from '../../../../../components/DashboardTiles/DashboardMarkdownTile';
import useEmbed from '../../../../providers/Embed/useEmbed';

export const EmbedMarkdownTile: React.FC<
    MarkdownTileProps & { tileIndex: number }
> = ({ tileIndex, ...props }) => {
    const { t } = useEmbed();

    const { properties: tileProperties } = props.tile;

    const translatedTile = useMemo(
        () => ({
            ...props.tile,
            properties: {
                ...props.tile.properties,
                title:
                    t(`tiles.${tileIndex}.properties.title`) ??
                    tileProperties.title,
                content:
                    t(`tiles.${tileIndex}.properties.content`) ??
                    tileProperties.content,
            },
        }),
        [
            props.tile,
            tileProperties.title,
            tileProperties.content,
            t,
            tileIndex,
        ],
    );

    return <DashboardMarkdownTile {...props} tile={translatedTile} />;
};
