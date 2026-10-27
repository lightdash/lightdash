import {
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import {
    useCallback,
    useEffect,
    useRef,
    type Dispatch,
    type MutableRefObject,
    type MouseEvent,
    type SetStateAction,
} from 'react';
import {
    selectDashboardTiles,
    useDashboardDateZoomConfig,
    useDashboardStore,
} from '../dashboard/store';
import { getMissingTileFieldId, getTileField } from './peers';
import { getTileSelector } from './tileSelector';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { getSqlColumnsByTile } from './useSqlColumnsByTile';
import { getZoomTileUuids } from './zoomState';

// Set on the grid items of the tiles a hovered pill's filter is on
const TILE_HOVER_ATTRIBUTE = 'data-controls-hovered';

const clearTiles = () =>
    document
        .querySelectorAll(`[${TILE_HOVER_ATTRIBUTE}]`)
        .forEach((element) => element.removeAttribute(TILE_HOVER_ATTRIBUTE));

// Only the pill that made the marks takes them away
const release = (
    filterId: string,
    owner: MutableRefObject<string | null>,
    setHoveredFilterId: Dispatch<SetStateAction<string | null>>,
) => {
    if (owner.current !== filterId) return;
    owner.current = null;
    clearTiles();
    setHoveredFilterId((id) => (id === filterId ? null : id));
};

// Marks the tiles on the filter while its pill is hovered or keyboard-focused,
// and names it as hovered for the tab badges. An attribute on the grid items,
// so no tile re-renders; tiles and fields are read on mark, so no pill does
export const useTileHover = (
    rule: DashboardFilterRule,
    isEnabled: boolean,
    getFieldsByTile: () =>
        | Record<string, DashboardFilterableField[]>
        | undefined,
) => {
    const store = useDashboardStore();
    const setHoveredFilterId = useControlsSidebarSelector(
        (c) => c.setHoveredFilterId,
    );
    const owner = useControlsSidebarSelector((c) => c.tileHoverOwner);
    const filterId = rule.id;
    const isMarking = useRef(false);
    // A press focuses the pill too, and may start a drag: that marks nothing
    const isPressed = useRef(false);

    const clear = () => {
        if (!isMarking.current) return;
        isMarking.current = false;
        release(filterId, owner, setHoveredFilterId);
    };

    useEffect(
        () => () => {
            if (!isMarking.current) return;
            isMarking.current = false;
            release(filterId, owner, setHoveredFilterId);
        },
        [isEnabled, filterId, owner, setHoveredFilterId],
    );

    const mark = () => {
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
        setHoveredFilterId(filterId);
    };

    return {
        onMouseEnter: (event: MouseEvent) => {
            if (event.buttons === 0) mark();
        },
        onMouseLeave: clear,
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

// The zoom pills are the shipped ones, rendered in a list: one hook hands each
// its handlers. Marks the tiles in the zoom, as a filter pill marks its tiles
export const useZoomTileHover = (isEnabled: boolean) => {
    const config = useDashboardDateZoomConfig();
    const setHoveredFilterId = useControlsSidebarSelector(
        (c) => c.setHoveredFilterId,
    );
    const owner = useControlsSidebarSelector((c) => c.tileHoverOwner);
    // The zoom this hook marked, until it clears
    const marked = useRef<string | null>(null);
    const isPressed = useRef(false);

    useEffect(
        () => () => {
            if (marked.current === null) return;
            const controlUuid = marked.current;
            marked.current = null;
            release(controlUuid, owner, setHoveredFilterId);
        },
        [isEnabled, owner, setHoveredFilterId],
    );

    // Stable while the config and the switch are, so the pills keep their props
    return useCallback(
        (controlUuid: string) => {
            const clear = () => {
                if (marked.current !== controlUuid) return;
                marked.current = null;
                release(controlUuid, owner, setHoveredFilterId);
            };
            const mark = () => {
                if (!isEnabled) return;
                clearTiles();
                getZoomTileUuids(config, controlUuid).forEach((tileUuid) =>
                    document
                        .querySelectorAll(getTileSelector(tileUuid))
                        .forEach((element) =>
                            element.setAttribute(TILE_HOVER_ATTRIBUTE, ''),
                        ),
                );
                marked.current = controlUuid;
                owner.current = controlUuid;
                setHoveredFilterId(controlUuid);
            };
            return {
                onMouseEnter: (event: MouseEvent) => {
                    if (event.buttons === 0) mark();
                },
                onMouseLeave: clear,
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
        },
        [config, isEnabled, owner, setHoveredFilterId],
    );
};
