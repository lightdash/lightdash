import { getParameterControlSetter } from '@lightdash/common';
import { useLayoutEffect, useRef, type FC } from 'react';
import { createPortal } from 'react-dom';
import {
    selectActiveTabUuid,
    selectDashboardTabs,
    selectDashboardTiles,
    useDashboardSelector,
} from '../dashboard/store';
import { FieldBar, type FieldBarCopy } from './FieldTilesBar';
import { getParameterKeyScope } from './parameterPeers';
import { getTilesOnTab } from './peers';
import { useBarHost } from './useBarHost';
import { type FieldTiles, type TileScope } from './useFieldTileActions';
import { useParameterEditorSelector } from './useParameterEditor';
import { useParameterMapping } from './useParameterMapping';

// Editors only map parameters: these words never reach a viewer
const PARAMETER_COPY: FieldBarCopy = {
    fillMore: 'Set {count} more',
    fillOnOtherTabs: 'Set {count} on other tabs',
    fillMoreNone: 'Set more',
    region: 'Tiles set through {field}',
    undoFillName: 'Undo setting {tiles} through {field}',
    noTile: 'No tile uses this parameter',
};

const noop = () => {};

// The filter flow's floating bar for the selected parameter chip: its count
// over every tab, Set and Clear over the tab in view first, then the others
export const ParameterTilesBar: FC = () => {
    const mapping = useParameterMapping();
    const selectedKey = useParameterEditorSelector((c) => c.selectedKey);
    const undo = useParameterEditorSelector((c) => c.mappingUndo);
    const undoMapping = useParameterEditorSelector((c) => c.undoMapping);
    const setKeyTiles = useParameterEditorSelector((c) => c.setKeyTiles);
    const tiles = useDashboardSelector(selectDashboardTiles);
    const tabs = useDashboardSelector(selectDashboardTabs);
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    const key =
        mapping !== null &&
        selectedKey !== null &&
        mapping.controlKeys.includes(selectedKey)
            ? selectedKey
            : null;
    const host = useBarHost(activeTabUuid, key !== null);
    // A tab switch draws the bar again in another grid: no second slide
    const drawnKey = useRef<string | null>(null);
    useLayoutEffect(() => {
        if (key === null) drawnKey.current = null;
        else if (host !== null) drawnKey.current = key;
    });
    if (mapping === null || key === null || host === null) return null;

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
    // Set more takes only tiles no control sets
    const scopeOf = (tileUuids: string[]) =>
        getParameterKeyScope({
            tileUuids,
            controls: mapping.controls,
            tileParameterReferences: mapping.tileParameterReferences,
            controlId: mapping.control.id,
            key,
            userParameterNames: mapping.userParameterNames,
        });
    const usesKey = (tileUuid: string) =>
        (mapping.tileParameterReferences[tileUuid] ?? []).includes(key);
    const ownerOf = (tileUuid: string) =>
        getParameterControlSetter(
            mapping.controls,
            key,
            tileUuid,
            mapping.userParameterNames,
        )?.id;
    const name = mapping.nameOf(key);
    const fieldTiles: FieldTiles = {
        field: null,
        label: name,
        name,
        tableLabel: '',
        isWaiting: false,
        thisTabScope: hasTabs ? scopeOf(scopeTiles('this-tab')) : null,
        otherTabsScope: hasTabs ? scopeOf(scopeTiles('other-tabs')) : null,
        everyTabScope: scopeOf(all),
        canAct: true,
        labelOf: mapping.controlNameOf,
        applyToAll: (scope) =>
            setKeyTiles(
                key,
                scopeTiles(scope).filter(
                    (uuid) => usesKey(uuid) && ownerOf(uuid) === undefined,
                ),
                true,
            ),
        clear: (scope) =>
            setKeyTiles(
                key,
                scopeTiles(scope).filter(
                    (uuid) => ownerOf(uuid) === mapping.control.id,
                ),
                false,
            ),
        remove: noop,
    };
    return createPortal(
        <FieldBar
            key={key}
            fieldTiles={fieldTiles}
            undo={undo}
            onUndo={undoMapping}
            isOnlyRow={false}
            isArriving={drawnKey.current !== key}
            copy={PARAMETER_COPY}
        />,
        host,
    );
};
