import { Box, Text, UnstyledButton } from '@mantine/core';
import { clsx } from 'clsx';
import { useEffect, useRef, type FC } from 'react';
import {
    dashboardEditActions,
    useDashboardDispatch,
} from '../../../features/dashboard/store';
import {
    TILE_WIDTH_PRESETS,
    type PointerPosition,
} from '../../../features/dashboardTabs/gridUtils';
import classes from './TileSelectionToolbar.module.css';

type Props = {
    tileUuid: string;
    /** The tile's width in desktop columns */
    width: number;
    align: 'start' | 'end';
    side: 'top' | 'bottom';
    /** Starts a copy of the tile under the pointer. Null for tiles that cannot be copied */
    onDuplicate:
        | ((gridItem: HTMLElement, pointer: PointerPosition) => void)
        | null;
    onDelete: () => void;
};

export const TileSelectionToolbar: FC<Props> = ({
    tileUuid,
    width,
    align,
    side,
    onDuplicate,
    onDelete,
}) => {
    const dispatch = useDashboardDispatch();
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const tile = ref.current?.closest('[data-tile-uuid]');
        const deselect = () => dispatch(dashboardEditActions.selectTile(null));
        const listeners = new AbortController();
        document.addEventListener(
            'pointerdown',
            (event) => {
                if (
                    event.target instanceof Node &&
                    !tile?.contains(event.target)
                ) {
                    deselect();
                }
            },
            { capture: true, signal: listeners.signal },
        );
        document.addEventListener(
            'keydown',
            (event) => {
                if (event.key === 'Escape') deselect();
            },
            { signal: listeners.signal },
        );
        return () => listeners.abort();
    }, [dispatch]);

    return (
        <Box
            ref={ref}
            role="toolbar"
            aria-label="Tile actions"
            className={clsx('non-draggable', classes.toolbar)}
            data-align={align}
            data-side={side}
        >
            <Text component="span" className={classes.label}>
                Width
            </Text>
            {TILE_WIDTH_PRESETS.map((preset) => (
                <UnstyledButton
                    key={preset.w}
                    className={classes.action}
                    aria-label={preset.name}
                    aria-pressed={width === preset.w}
                    onClick={() =>
                        dispatch(
                            dashboardEditActions.setTileWidth({
                                uuid: tileUuid,
                                w: preset.w,
                            }),
                        )
                    }
                >
                    {preset.label}
                </UnstyledButton>
            ))}
            <Box className={classes.divider} />
            {onDuplicate && (
                <UnstyledButton
                    className={classes.action}
                    onClick={({ currentTarget, clientX, clientY }) => {
                        const gridItem =
                            currentTarget.closest<HTMLElement>(
                                '.react-grid-item',
                            );
                        if (gridItem) {
                            onDuplicate(gridItem, { clientX, clientY });
                        }
                    }}
                >
                    Duplicate
                </UnstyledButton>
            )}
            <UnstyledButton
                className={classes.action}
                data-danger
                onClick={onDelete}
            >
                Delete
            </UnstyledButton>
        </Box>
    );
};
