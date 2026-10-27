import { type DashboardFilterRule } from '@lightdash/common';
import { useEffect, useRef, type MouseEvent } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { selectDashboardTiles, useDashboardSelector } from '../dashboard/store';
import { getMissingTileFieldId, getTileField } from './peers';
import { getTileSelector } from './tileSelector';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

// Set on the grid items of the tiles a hovered pill's filter is on
const TILE_HOVER_ATTRIBUTE = 'data-controls-hovered';

const clearTiles = () =>
    document
        .querySelectorAll(`[${TILE_HOVER_ATTRIBUTE}]`)
        .forEach((element) => element.removeAttribute(TILE_HOVER_ATTRIBUTE));

// Marks the tiles on the filter while its pill is hovered or keyboard-focused.
// An attribute on the grid items, so no tile re-renders
export const useTileHover = (rule: DashboardFilterRule, isEnabled: boolean) => {
    const tiles = useDashboardSelector(selectDashboardTiles);
    const fieldsByTile = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const sqlColumnsByTile = useSqlColumnsByTile(rule);
    const isMarking = useRef(false);
    // A press focuses the pill too, and may start a drag: that marks nothing
    const isPressed = useRef(false);

    const clear = () => {
        if (!isMarking.current) return;
        isMarking.current = false;
        clearTiles();
    };

    useEffect(
        () => () => {
            if (isMarking.current) {
                isMarking.current = false;
                clearTiles();
            }
        },
        [isEnabled],
    );

    const mark = () => {
        if (!isEnabled) return;
        clearTiles();
        (tiles ?? [])
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
