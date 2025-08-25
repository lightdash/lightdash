import { mergeExisting } from '@lightdash/common';
import { produce } from 'immer';
import { useMemo } from 'react';
import DashboardMarkdownTile, {
    type Props as MarkdownTileProps,
} from '../../../../../components/DashboardTiles/DashboardMarkdownTile';
import useEmbed from '../../../../providers/Embed/useEmbed';

export const EmbedMarkdownTile: React.FC<
    MarkdownTileProps & { tileIndex: number; dashboardSlug: string }
> = ({ tileIndex, dashboardSlug, ...props }) => {
    const { languageMap } = useEmbed();

    const translatedTile = useMemo(() => {
        if (!languageMap || !props.tile) return props.tile;

        const properties =
            languageMap.dashboard?.[dashboardSlug]?.tiles?.[tileIndex]
                ?.properties || {};

        return produce(props.tile, (draft) => {
            draft.properties = mergeExisting(draft.properties, properties);
        });
    }, [props.tile, languageMap, tileIndex, dashboardSlug]);

    return <DashboardMarkdownTile {...props} tile={translatedTile} />;
};
