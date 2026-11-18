import { Box, Text } from '@mantine/core';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
import {
    getCarriedTileCell,
    getPointerCell,
    type GridCell,
    type GridSlot,
    type PointerPosition,
} from '../../../features/dashboardTabs/gridUtils';
import classes from './TileCopyPlacement.module.css';

type Props = {
    /** The copied tile's place on the grid, in desktop columns */
    tile: GridSlot;
    /** The copied tile on screen; it measures the grid, zoom included */
    gridItem: HTMLElement;
    pointer: PointerPosition;
    onPlace: (cell: GridCell) => void;
    onCancel: () => void;
};

/**
 * A copy of a tile carried by the pointer over the grid: a click puts it
 * down, Escape or a press off the grid drops it.
 */
export const TileCopyPlacement: FC<Props> = ({
    tile,
    gridItem,
    pointer,
    onPlace,
    onCancel,
}) => {
    const layerRef = useRef<HTMLDivElement>(null);
    const getCell = useCallback(
        (position: PointerPosition) =>
            getCarriedTileCell(
                getPointerCell({
                    pointer: position,
                    tile: { i: '', ...tile },
                    tileRect: gridItem.getBoundingClientRect(),
                }),
                tile,
            ),
        [tile, gridItem],
    );
    const [cell, setCell] = useState(() => getCell(pointer));

    useEffect(() => {
        const listeners = new AbortController();
        document.addEventListener(
            'keydown',
            (event) => {
                if (event.key !== 'Escape') return;
                // Only the copy goes; the tile stays selected
                event.stopPropagation();
                onCancel();
            },
            { capture: true, signal: listeners.signal },
        );
        document.addEventListener(
            'pointerdown',
            (event) => {
                if (
                    event.target instanceof Node &&
                    !layerRef.current?.contains(event.target)
                ) {
                    onCancel();
                }
            },
            { capture: true, signal: listeners.signal },
        );
        return () => listeners.abort();
    }, [onCancel]);

    const grid = gridItem.parentElement;
    if (!grid) return null;

    const cellWidth = gridItem.offsetWidth / tile.w;
    const cellHeight = gridItem.offsetHeight / tile.h;

    return createPortal(
        <Box
            ref={layerRef}
            className={classes.layer}
            data-tile-placement
            onPointerMove={(event) => {
                const next = getCell(event);
                setCell((current) =>
                    current.x === next.x && current.y === next.y
                        ? current
                        : next,
                );
            }}
            onClick={(event) => onPlace(getCell(event))}
        >
            <Box
                className={classes.ghost}
                // oxlint-disable-next-line lightdash-ui/no-inline-style-prop
                style={{
                    transform: `translate(${
                        gridItem.offsetLeft + (cell.x - tile.x) * cellWidth
                    }px, ${
                        gridItem.offsetTop + (cell.y - tile.y) * cellHeight
                    }px)`,
                    width: gridItem.offsetWidth,
                    height: gridItem.offsetHeight,
                }}
            >
                <Text component="span" className={classes.hint}>
                    Click to place the copy
                </Text>
            </Box>
        </Box>,
        grid,
    );
};
