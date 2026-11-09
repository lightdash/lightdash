import { useLayoutEffect, useRef, type FC } from 'react';
import { createPortal } from 'react-dom';
import {
    selectActiveTabUuid,
    selectDashboardTabs,
    selectDashboardTiles,
    useDashboardSelector,
} from '../dashboard/store';
import { FieldBar, type FieldBarCopy } from './FieldTilesBar';
import { getTilesOnTab, type FieldScope } from './peers';
import { useBarHost } from './useBarHost';
import { useDateZoomEditorSelector } from './useDateZoomEditor';
import { useDateZoomMapping, type DateZoomMapping } from './useDateZoomMapping';
import { type FieldTiles, type TileScope } from './useFieldTileActions';

// Editors only map date zooms: these words never reach a viewer
const DATE_ZOOM_COPY: FieldBarCopy = {
    fillMore: 'Zoom {count} more',
    fillOnOtherTabs: 'Zoom {count} on other tabs',
    fillMoreNone: 'Zoom more',
    region: 'Tiles zoomed by {field}',
    undoFillName: 'Undo zooming {tiles} by {field}',
    noTile: 'No tile has a date to zoom',
};

const noop = () => {};

// A tile no zoom holds can be added; one in another zoom is the card's to move
const getScope = (
    mapping: DateZoomMapping,
    tileUuids: string[],
): FieldScope => {
    const takeable = tileUuids.filter(
        (uuid) => (mapping.cardByTile[uuid]?.kind ?? 'none') !== 'none',
    );
    const ownerOf = (uuid: string) =>
        mapping.config.tileTargets[uuid]?.controlUuid;
    return {
        possible: takeable.length,
        applied: takeable.filter(
            (uuid) => ownerOf(uuid) === mapping.control.uuid,
        ).length,
        unfiltered: takeable.filter((uuid) => ownerOf(uuid) === undefined)
            .length,
        replaced: 0,
        replacedFieldIds: [],
    };
};

// The filter flow's floating bar for the zoom being mapped: its count over
// every tab, Zoom more and Clear over the tab in view first, then the others
export const DateZoomTilesBar: FC = () => {
    const isMapping = useDateZoomEditorSelector((c) => c.isMapping);
    return isMapping ? <MappedTilesBar /> : null;
};

const MappedTilesBar: FC = () => {
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
        if (host !== null) isDrawn.current = true;
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
    const ownerOf = (uuid: string) =>
        mapping.config.tileTargets[uuid]?.controlUuid;
    const fieldTiles: FieldTiles = {
        field: null,
        label: mapping.name,
        name: mapping.name,
        tableLabel: '',
        isWaiting: false,
        thisTabScope: hasTabs
            ? getScope(mapping, scopeTiles('this-tab'))
            : null,
        otherTabsScope: hasTabs
            ? getScope(mapping, scopeTiles('other-tabs'))
            : null,
        everyTabScope: getScope(mapping, all),
        canAct: true,
        labelOf: (uuid) => uuid,
        applyToAll: (scope) =>
            setTiles(
                scopeTiles(scope).filter(
                    (uuid) =>
                        (mapping.cardByTile[uuid]?.kind ?? 'none') !== 'none' &&
                        ownerOf(uuid) === undefined,
                ),
                true,
            ),
        clear: (scope) =>
            setTiles(
                scopeTiles(scope).filter(
                    (uuid) => ownerOf(uuid) === mapping.control.uuid,
                ),
                false,
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
