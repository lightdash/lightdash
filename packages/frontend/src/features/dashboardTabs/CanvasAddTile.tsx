import { defaultTileSize, type Dashboard } from '@lightdash/common';
import {
    Popover,
    SimpleGrid,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useEffect, useState, type FC, type RefObject } from 'react';
import { type Layout } from 'react-grid-layout';
import MantineIcon from '../../components/common/MantineIcon';
import {
    useAddTileOptions,
    type AddTileOptionsArgs,
} from '../../components/DashboardTiles/useAddTileOptions';
import classes from './CanvasAddTile.module.css';
import {
    getAddTileSlot,
    getPointerCell,
    GRID_DESKTOP_COLS,
    MIN_TILE_COLS,
    type GridSlot,
} from './gridUtils';

type PixelRect = { left: number; top: number; width: number; height: number };

/** A place for a new tile: where it is drawn, and where it is stored */
type AddTileTarget = { rect: PixelRect; slot: GridSlot };

const MIN_PLACEHOLDER_HEIGHT = 64;

const isSameTarget = (a: AddTileTarget | null, b: AddTileTarget | null) =>
    a === b ||
    (a !== null &&
        b !== null &&
        a.slot.x === b.slot.x &&
        a.slot.y === b.slot.y &&
        a.slot.w === b.slot.w &&
        a.slot.h === b.slot.h &&
        a.rect.left === b.rect.left &&
        a.rect.top === b.rect.top &&
        a.rect.width === b.rect.width &&
        a.rect.height === b.rect.height);

const getTargetUnderPointer = ({
    event,
    canvas,
    layout,
    gridScale,
}: {
    event: MouseEvent;
    canvas: HTMLElement;
    layout: Layout[];
    gridScale: number;
}): AddTileTarget | null => {
    if (
        !(event.target instanceof Element) ||
        event.target.closest('.react-grid-item')
    )
        return null;

    // Any tile on screen measures the grid, zoom included
    const measured = layout
        .map((tile) => ({
            tile,
            node: canvas.querySelector<HTMLElement>(
                `.react-grid-item[data-tile-uuid="${CSS.escape(tile.i)}"]`,
            ),
        }))
        .find(({ node }) => node !== null && node.offsetWidth > 0);
    if (!measured?.node) return null;
    const { tile } = measured;
    const tileRect = measured.node.getBoundingClientRect();

    const slot = getAddTileSlot({
        items: layout,
        cell: getPointerCell({ pointer: event, tile, tileRect }),
        cols: GRID_DESKTOP_COLS * gridScale,
        minWidth: MIN_TILE_COLS * gridScale,
        defaultSize: {
            w: defaultTileSize.w * gridScale,
            h: defaultTileSize.h * gridScale,
        },
    });
    if (!slot) return null;

    const canvasRect = canvas.getBoundingClientRect();
    const cellWidth = tileRect.width / tile.w;
    const cellHeight = tileRect.height / tile.h;
    const top = tileRect.top - canvasRect.top + (slot.y - tile.y) * cellHeight;
    return {
        rect: {
            left:
                tileRect.left - canvasRect.left + (slot.x - tile.x) * cellWidth,
            top,
            width: slot.w * cellWidth,
            // A tile under the last row is taller than the canvas left there
            height: Math.max(
                MIN_PLACEHOLDER_HEIGHT,
                Math.min(slot.h * cellHeight, canvasRect.height - top),
            ),
        },
        slot: {
            x: slot.x / gridScale,
            y: slot.y / gridScale,
            w: slot.w / gridScale,
            h: slot.h / gridScale,
        },
    };
};

type Props = Pick<
    AddTileOptionsArgs,
    'activeTabUuid' | 'dashboardTabs' | 'onNewChart'
> & {
    canvasRef: RefObject<HTMLDivElement | null>;
    /** The grid on screen, in the units it is drawn in */
    layout: Layout[];
    gridScale: number;
    /** Off while a tile is being dragged or resized */
    isEnabled: boolean;
    onAddTilesToSlot: (
        tiles: Dashboard['tiles'][number][],
        slot: GridSlot,
    ) => void;
};

/**
 * A ghost tile under the pointer on the empty canvas after the last tiles,
 * showing where a new tile would land. Choosing a tile type adds it there.
 */
export const CanvasAddTile: FC<Props> = ({
    canvasRef,
    layout,
    gridScale,
    isEnabled,
    activeTabUuid,
    dashboardTabs,
    onNewChart,
    onAddTilesToSlot,
}) => {
    const [hovered, setHovered] = useState<AddTileTarget | null>(null);
    // Kept from the click on, so the dialogs it leads to still know the place
    const [chosen, setChosen] = useState<AddTileTarget | null>(null);
    const [isPickerOpen, setIsPickerOpen] = useState(false);

    const { tileOptions, canAddTile, modals } = useAddTileOptions({
        onAddTiles: (tiles) => {
            if (chosen) onAddTilesToSlot(tiles, chosen.slot);
        },
        activeTabUuid,
        dashboardTabs,
        onNewChart,
    });
    const isListening = isEnabled && canAddTile && !isPickerOpen;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !isListening) return;
        const clear = () => setHovered(null);
        const track = (event: MouseEvent) => {
            const next = getTargetUnderPointer({
                event,
                canvas,
                layout,
                gridScale,
            });
            setHovered((current) =>
                isSameTarget(current, next) ? current : next,
            );
        };
        canvas.addEventListener('mousemove', track);
        canvas.addEventListener('mouseleave', clear);
        return () => {
            canvas.removeEventListener('mousemove', track);
            canvas.removeEventListener('mouseleave', clear);
            clear();
        };
    }, [canvasRef, isListening, layout, gridScale]);

    const shown = isPickerOpen ? chosen : hovered;

    return (
        <>
            {shown && (
                <UnstyledButton
                    className={classes.placeholder}
                    data-picker-open={isPickerOpen || undefined}
                    // oxlint-disable-next-line lightdash-ui/no-inline-style-prop
                    style={shown.rect}
                    onClick={() => {
                        setChosen(shown);
                        setIsPickerOpen(true);
                    }}
                >
                    <Popover
                        opened={isPickerOpen}
                        onChange={setIsPickerOpen}
                        position="bottom"
                        trapFocus
                        withArrow
                    >
                        <Popover.Target>
                            <Text component="span" className={classes.label}>
                                <MantineIcon icon={IconPlus} />
                                Add tile
                            </Text>
                        </Popover.Target>
                        <Popover.Dropdown
                            p="xs"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <SimpleGrid cols={3} spacing="xs">
                                {tileOptions.map((option) => (
                                    <Tooltip
                                        key={option.id}
                                        label={option.hint}
                                        disabled={option.hint === null}
                                    >
                                        <UnstyledButton
                                            className={classes.option}
                                            onClick={() => {
                                                setIsPickerOpen(false);
                                                option.onSelect();
                                            }}
                                        >
                                            <MantineIcon
                                                icon={option.icon}
                                                size="lg"
                                                color="ldGray.6"
                                            />
                                            <Text fz="xs" fw={500}>
                                                {option.label}
                                            </Text>
                                        </UnstyledButton>
                                    </Tooltip>
                                ))}
                            </SimpleGrid>
                        </Popover.Dropdown>
                    </Popover>
                </UnstyledButton>
            )}
            {modals}
        </>
    );
};
