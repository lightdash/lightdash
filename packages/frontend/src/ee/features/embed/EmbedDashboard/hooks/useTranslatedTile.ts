import { mergeExisting, type DashboardTile } from '@lightdash/common';
import { produce } from 'immer';
import { useMemo } from 'react';
import useEmbed from '../../../../providers/Embed/useEmbed';

export const useTranslatedTile = <T extends DashboardTile>(
    tile: T,
    dashboardSlug: string,
    tileIndex: number,
): T => {
    const { languageMap } = useEmbed();

    return useMemo(() => {
        if (!languageMap) return tile;

        const properties =
            languageMap.dashboard?.[dashboardSlug]?.tiles?.[tileIndex]
                ?.properties || {};

        return produce(tile, (draft) => {
            draft.properties = mergeExisting(draft.properties, properties);
        });
    }, [tile, languageMap, tileIndex, dashboardSlug]);
};
