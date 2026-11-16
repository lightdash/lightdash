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
import { type FieldApply } from './useControlsEditor';
import { type FieldTiles, type TileScope } from './useFieldTileActions';

const noop = () => {};

type Props = {
    /** What the bar is for (a key, a zoom): a new one slides in. */
    barKey: string;
    name: string;
    copy: FieldBarCopy;
    labelOf: (id: string) => string;
    /** The counts over these tiles. */
    scopeOf: (tileUuids: string[]) => FieldScope;
    /** Add or clear over these tiles (a scope's). */
    fill: (tileUuids: string[]) => void;
    clear: (tileUuids: string[]) => void;
    undo: FieldApply | null;
    onUndo: () => void;
};

// The filter flow's floating bar for a parameter key or a date zoom whose
// tiles are chosen: its count over every tab, add and Clear over the tab in
// view first, then the others
export const ControlTilesBar: FC<Props> = ({
    barKey,
    name,
    copy,
    labelOf,
    scopeOf,
    fill,
    clear,
    undo,
    onUndo,
}) => {
    const tiles = useDashboardSelector(selectDashboardTiles);
    const tabs = useDashboardSelector(selectDashboardTabs);
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    const host = useBarHost(activeTabUuid, true);
    // A tab switch draws the bar again in another grid: no second slide
    const drawnKey = useRef<string | null>(null);
    useLayoutEffect(() => {
        if (host !== null) drawnKey.current = barKey;
    });
    if (host === null) return null;

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
        label: name,
        name,
        tableLabel: '',
        isWaiting: false,
        thisTabScope: hasTabs ? scopeOf(scopeTiles('this-tab')) : null,
        otherTabsScope: hasTabs ? scopeOf(scopeTiles('other-tabs')) : null,
        everyTabScope: scopeOf(all),
        canAct: true,
        labelOf,
        applyToAll: (scope) => fill(scopeTiles(scope)),
        clear: (scope) => clear(scopeTiles(scope)),
        remove: noop,
    };
    return createPortal(
        <FieldBar
            key={barKey}
            fieldTiles={fieldTiles}
            undo={undo}
            onUndo={onUndo}
            isOnlyRow={false}
            isArriving={drawnKey.current !== barKey}
            copy={copy}
        />,
        host,
    );
};
