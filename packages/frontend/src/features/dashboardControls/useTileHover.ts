import {
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import {
    useEffect,
    useRef,
    type MouseEvent,
    type MutableRefObject,
} from 'react';
import { selectDashboardTiles, useDashboardStore } from '../dashboard/store';
import { getMissingTileFieldId, getTileField } from './peers';
import { getTileSelector } from './tileSelector';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { getSqlColumnsByTile } from './useSqlColumnsByTile';

// Set on the grid items of the tiles a hovered pill's filter is on
const TILE_HOVER_ATTRIBUTE = 'data-controls-hovered';
// Bridges the gap between two pills, so the marks never flash off and on
const LEAVE_GRACE_MS = 150;

const clearTiles = () =>
    document
        .querySelectorAll(`[${TILE_HOVER_ATTRIBUTE}]`)
        .forEach((element) => element.removeAttribute(TILE_HOVER_ATTRIBUTE));

// Only the pill that made the marks takes them away
const release = (filterId: string, owner: MutableRefObject<string | null>) => {
    if (owner.current !== filterId) return;
    owner.current = null;
    clearTiles();
};

// Marks the tiles on the filter while its pill is hovered or keyboard-focused.
// An attribute on the grid items, so no tile re-renders; tiles and fields are
// read on mark, so no pill does
export const useTileHover = (
    rule: DashboardFilterRule,
    isEnabled: boolean,
    getFieldsByTile: () =>
        | Record<string, DashboardFilterableField[]>
        | undefined,
) => {
    const store = useDashboardStore();
    const owner = useControlsSidebarSelector((c) => c.tileHoverOwner);
    const filterId = rule.id;
    const isMarking = useRef(false);
    // A press focuses the pill too, and may start a drag: that marks nothing
    const isPressed = useRef(false);
    const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const cancelLeave = () => {
        if (leaveTimer.current === null) return;
        clearTimeout(leaveTimer.current);
        leaveTimer.current = null;
    };

    const clear = () => {
        cancelLeave();
        if (!isMarking.current) return;
        isMarking.current = false;
        release(filterId, owner);
    };

    useEffect(
        () => () => {
            if (leaveTimer.current !== null) clearTimeout(leaveTimer.current);
            leaveTimer.current = null;
            if (!isMarking.current) return;
            isMarking.current = false;
            release(filterId, owner);
        },
        [isEnabled, filterId, owner],
    );

    const mark = () => {
        cancelLeave();
        if (!isEnabled) return;
        clearTiles();
        const state = store.getState();
        const fieldsByTile = getFieldsByTile();
        const sqlColumnsByTile = getSqlColumnsByTile(rule, state);
        (selectDashboardTiles(state) ?? [])
            .filter(
                (tile) =>
                    getTileField(rule, tile, fieldsByTile, sqlColumnsByTile) !==
                        null &&
                    getMissingTileFieldId(
                        rule,
                        tile,
                        fieldsByTile,
                        sqlColumnsByTile,
                    ) === null,
            )
            .forEach((tile) =>
                document
                    .querySelectorAll(getTileSelector(tile.uuid))
                    .forEach((element) =>
                        element.setAttribute(TILE_HOVER_ATTRIBUTE, ''),
                    ),
            );
        isMarking.current = true;
        owner.current = filterId;
    };

    return {
        onMouseEnter: (event: MouseEvent) => {
            if (event.buttons === 0) mark();
        },
        onMouseLeave: () => {
            cancelLeave();
            leaveTimer.current = setTimeout(clear, LEAVE_GRACE_MS);
        },
        onFocus: () => {
            if (!isPressed.current) mark();
        },
        onBlur: () => {
            isPressed.current = false;
            clear();
        },
        onPointerDown: () => {
            isPressed.current = true;
            clear();
        },
    };
};
