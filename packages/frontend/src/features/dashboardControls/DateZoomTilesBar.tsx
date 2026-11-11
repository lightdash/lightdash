import { type FC } from 'react';
import { ControlTilesBar } from './ControlTilesBar';
import { getBulkZoomChanges, type DateZoomMapping } from './dateZoomControls';
import { type FieldBarCopy } from './FieldTilesBar';
import { type FieldScope } from './peers';
import { useDateZoomEditorSelector } from './useDateZoomEditor';
import { useDateZoomMapping } from './useDateZoomMapping';

// Editors only map date zooms: these words never reach a viewer
const DATE_ZOOM_COPY: FieldBarCopy = {
    fillMore: 'Apply to {count} more',
    fillOnOtherTabs: 'Apply to {count} on other tabs',
    fillMoreNone: 'Apply to more',
    region: 'Tiles zoomed by {field}',
    undoFillName: 'Undo zooming {tiles} by {field}',
    noTile: 'No tile has a date to zoom',
};

// Over these tiles: those a zoom can take, those this one has, those in no zoom
const getZoomScope = (
    mapping: DateZoomMapping,
    tileUuids: string[],
): FieldScope => {
    const cards = tileUuids.flatMap((uuid) => {
        const card = mapping.cardByTile[uuid];
        return card === undefined || card.kind === 'none' ? [] : [card];
    });
    return {
        possible: cards.length,
        applied: cards.filter(({ fieldId }) => fieldId !== undefined).length,
        unfiltered: cards.filter(
            ({ fieldId, takenBy }) => fieldId === undefined && takenBy === null,
        ).length,
        replaced: 0,
        replacedFieldIds: [],
    };
};

// The floating bar for the zoom whose tiles are chosen
export const DateZoomTilesBar: FC = () => {
    const mapping = useDateZoomMapping();
    const undo = useDateZoomEditorSelector((c) => c.mappingUndo);
    const undoMapping = useDateZoomEditorSelector((c) => c.undoMapping);
    const setTiles = useDateZoomEditorSelector((c) => c.setTiles);
    if (mapping === null) return null;
    return (
        <ControlTilesBar
            barKey="date-zoom"
            name={mapping.name}
            copy={DATE_ZOOM_COPY}
            labelOf={(fieldId) => fieldId}
            scopeOf={(tileUuids) => getZoomScope(mapping, tileUuids)}
            // Tiles in another zoom stay there: only their own card moves them
            fill={(tileUuids) =>
                setTiles(getBulkZoomChanges(mapping, tileUuids), 'apply')
            }
            clear={(tileUuids) =>
                setTiles(
                    tileUuids
                        .filter((uuid) =>
                            mapping.zoomedTileUuids.includes(uuid),
                        )
                        .map((tileUuid) => ({ tileUuid, target: null })),
                    'clear',
                )
            }
            undo={undo}
            onUndo={undoMapping}
        />
    );
};
