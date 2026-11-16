import { type DateZoomControl } from '@lightdash/common';
import { useMemo } from 'react';
import {
    selectDashboardTiles,
    useDashboardDateZoomConfig,
    useDashboardSelector,
} from '../dashboard/store';
import { useEligibleDateZoomTiles } from '../dateZoom/hooks';
import {
    getDateZoomMapping,
    type DateZoomMapping,
    type DateZoomTileTargets,
} from './dateZoomControls';
import { useDateZoomEditorSelector } from './useDateZoomEditor';

/** Everything mapping a date zoom shows, computed once by the editor; null while not mapping. */
export const useDateZoomMapping = (): DateZoomMapping | null =>
    useDateZoomEditorSelector((c) => c.mapping);

// The editor's one computation of the mapping model, from its edit state
export const useDateZoomMappingModel = (
    /** The draft while its tiles are chosen, else null. */
    draft: DateZoomControl | null,
    targets: DateZoomTileTargets | null,
): DateZoomMapping | null => {
    const config = useDashboardDateZoomConfig();
    const tiles = useDashboardSelector(selectDashboardTiles);
    const eligible = useEligibleDateZoomTiles(config, draft?.uuid ?? '');
    return useMemo(
        () =>
            draft === null || targets === null
                ? null
                : getDateZoomMapping({
                      draft,
                      controls: config.controls,
                      targets,
                      tileUuids: (tiles ?? []).map(({ uuid }) => uuid),
                      eligible: eligible.map(
                          ({ tile, zoomableFields, isParamOnly }) => ({
                              tileUuid: tile.uuid,
                              fields: zoomableFields,
                              isParamOnly,
                          }),
                      ),
                  }),
        [draft, targets, config.controls, tiles, eligible],
    );
};
