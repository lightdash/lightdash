import {
    EMPTY_DATE_ZOOM_CONFIG,
    type ChartZoomableField,
    type DateZoomConfig,
    type DateZoomControl,
} from '@lightdash/common';
import { useMemo } from 'react';
import { selectDashboardTiles, useDashboardSelector } from '../dashboard/store';
import { useEligibleTiles } from '../dateZoom/components/useDateZoomControlOptions';
import { getZoomTileUuids } from './dateZoomControls';
import { useDateZoomEditorSelector } from './useDateZoomEditor';

/** What a tile's card offers: its date fields, a switch (it only reads the parameter), or nothing. */
export type DateZoomTileCard =
    | { kind: 'none' }
    | {
          kind: 'fields';
          fields: ChartZoomableField[];
          /** The field this zoom re-grains on it; null: not in this zoom. */
          fieldId: string | null;
          takenBy: DateZoomControl | null;
      }
    | { kind: 'parameter'; isOn: boolean; takenBy: DateZoomControl | null };

export type DateZoomMapping = {
    control: DateZoomControl;
    config: DateZoomConfig;
    name: string;
    cardByTile: Record<string, DateZoomTileCard>;
    takeableTileUuids: string[];
    setTileUuids: string[];
    /** Tiles another zoom holds in the draft: a Move of its last one removes it. */
    tileCountOf: (controlUuid: string) => number;
};

const NONE: DateZoomTileCard = { kind: 'none' };

/** The edited zoom's tiles as mapping shows them; null while not mapping. */
export const useDateZoomMapping = (): DateZoomMapping | null => {
    const isMapping = useDateZoomEditorSelector((c) => c.isMapping);
    const control = useDateZoomEditorSelector((c) => c.draft);
    const draftConfig = useDateZoomEditorSelector((c) => c.draftConfig);
    const tiles = useDashboardSelector(selectDashboardTiles);
    const config = isMapping ? draftConfig : null;
    const eligibleTiles = useEligibleTiles(
        config ?? EMPTY_DATE_ZOOM_CONFIG,
        control?.uuid ?? '',
    );
    return useMemo(() => {
        if (config === null || control === null) return null;
        const eligible = new Map(
            eligibleTiles.map((entry) => [entry.tile.uuid, entry]),
        );
        const cardByTile = Object.fromEntries(
            (tiles ?? []).map(({ uuid }): [string, DateZoomTileCard] => {
                const entry = eligible.get(uuid);
                if (entry === undefined) return [uuid, NONE];
                const target = config.tileTargets[uuid];
                const isOurs = target?.controlUuid === control.uuid;
                const takenBy = entry.conflictControl ?? null;
                return [
                    uuid,
                    entry.isParamOnly
                        ? { kind: 'parameter', isOn: isOurs, takenBy }
                        : {
                              kind: 'fields',
                              fields: entry.zoomableFields,
                              fieldId: isOurs ? target.fieldId : null,
                              takenBy,
                          },
                ];
            }),
        );
        const tileUuids = Object.keys(cardByTile);
        return {
            control,
            config,
            name: control.name,
            cardByTile,
            takeableTileUuids: tileUuids.filter(
                (uuid) => cardByTile[uuid].kind !== 'none',
            ),
            setTileUuids: tileUuids.filter(
                (uuid) =>
                    config.tileTargets[uuid]?.controlUuid === control.uuid,
            ),
            tileCountOf: (uuid) => getZoomTileUuids(config, uuid).length,
        };
    }, [config, control, eligibleTiles, tiles]);
};
