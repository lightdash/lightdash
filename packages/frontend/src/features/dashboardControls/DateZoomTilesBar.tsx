import { useLayoutEffect, useRef, type FC } from 'react';
import { createPortal } from 'react-dom';
import {
    selectActiveTabUuid,
    selectDashboardTabs,
    selectDashboardTiles,
    useDashboardSelector,
} from '../dashboard/store';
import { getBulkZoomChanges, type DateZoomMapping } from './dateZoomControls';
import { FieldBar, type FieldBarCopy } from './FieldTilesBar';
import { getTilesOnTab, type FieldScope } from './peers';
import { useBarHost } from './useBarHost';
import { useDateZoomEditorSelector } from './useDateZoomEditor';
import { useDateZoomMapping } from './useDateZoomMapping';
import { type FieldTiles, type TileScope } from './useFieldTileActions';

// Editors only map date zooms: these words never reach a viewer
const DATE_ZOOM_COPY: FieldBarCopy = {
    fillMore: 'Apply to {count} more',
    fillOnOtherTabs: 'Apply to {count} on other tabs',
    fillMoreNone: 'Apply to more',
    region: 'Tiles zoomed by {field}',
    undoFillName: 'Undo zooming {tiles} by {field}',
    noTile: 'No tile has a date to zoom',
};

const noop = () => {};

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

// The filter flow's floating bar for the zoom whose tiles are chosen: its
// count over every tab, add and Clear over the tab in view first, then the others
export const DateZoomTilesBar: FC = () => {
    const mapping = useDateZoomMapping();
    const undo = useDateZoomEditorSelector((c) => c.mappingUndo);
    const undoMapping = useDateZoomEditorSelector((c) => c.undoMapping);
    const setTiles = useDateZoomEditorSelector((c) => c.setTiles);
    const tiles = useDashboardSelector(selectDashboardTiles);
    const tabs = useDashboardSelector(selectDashboardTabs);
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    const host = useBarHost(activeTabUuid, mapping !== null);
    // A tab switch draws the bar again in another grid: no second slide
    const isDrawn = useRef(false);
    useLayoutEffect(() => {
        isDrawn.current = mapping !== null && host !== null;
    });
    if (mapping === null || host === null) return null;

    const all = (tiles ?? []).map(({ uuid }) => uuid);
    const hasTabs = tabs.length > 0 && activeTabUuid !== undefined;
    const onTab = hasTabs
        ? getTilesOnTab(tiles ?? [], tabs, activeTabUuid).map(
              ({ uuid }) => uuid,
          )
        : all;
    const scopeTiles = (scope: TileScope) =>
        scope === 'this-tab'
            ? onTab
            : scope === 'other-tabs'
              ? all.filter((uuid) => !onTab.includes(uuid))
              : all;
    const fieldTiles: FieldTiles = {
        field: null,
        label: mapping.name,
        name: mapping.name,
        tableLabel: '',
        isWaiting: false,
        thisTabScope: hasTabs
            ? getZoomScope(mapping, scopeTiles('this-tab'))
            : null,
        otherTabsScope: hasTabs
            ? getZoomScope(mapping, scopeTiles('other-tabs'))
            : null,
        everyTabScope: getZoomScope(mapping, all),
        canAct: true,
        labelOf: (fieldId) => fieldId,
        // Tiles in another zoom stay there: only their own card moves them
        applyToAll: (scope) =>
            setTiles(getBulkZoomChanges(mapping, scopeTiles(scope)), 'apply'),
        clear: (scope) =>
            setTiles(
                scopeTiles(scope)
                    .filter((uuid) => mapping.zoomedTileUuids.includes(uuid))
                    .map((tileUuid) => ({ tileUuid, target: null })),
                'clear',
            ),
        remove: noop,
    };
    return createPortal(
        <FieldBar
            fieldTiles={fieldTiles}
            undo={undo}
            onUndo={undoMapping}
            isOnlyRow={false}
            isArriving={!isDrawn.current}
            copy={DATE_ZOOM_COPY}
        />,
        host,
    );
};
