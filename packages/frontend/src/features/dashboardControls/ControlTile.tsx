import { type DashboardTile } from '@lightdash/common';
import { Box, Paper, Stack, Text } from '@mantine/core';
import { clsx } from 'clsx';
import { useEffect, useRef, type FC, type ReactNode } from 'react';
import { useDashboardControls, useIsControlTileHighlighted } from './context';
import ControlPreviewScope from './ControlPreviewScope';
import ControlTileMapping from './ControlTileMapping';
import classes from './dashboardControls.module.css';
import { getTileTitle } from './tiles';

// The dashboard's sticky tabs and filter bar
const STICKY_BAR_SELECTOR = '[data-has-header-above]';
const SCROLL_GAP_PX = 12;

type Props = {
    tile: DashboardTile;
    // The tile as it normally renders: a faded backdrop behind the mapping,
    // or the chart at full strength while it is previewed
    children: ReactNode;
};

// A tile while a control is open: its title and its mapping for the control
const ControlTile: FC<Props> = ({ tile, children }) => {
    const { previewTileUuids, scrollRequest, takeScrollRequest, hidePopover } =
        useDashboardControls();
    // Dropdowns render in a portal; their presses must not start a tile drag.
    // Stopping them also hides them from the popover's outside-click, so a
    // press on the mapping shrinks the popover itself; the draft is kept.
    const stopDrag = {
        onMouseDown: (event: React.MouseEvent) => {
            hidePopover();
            event.stopPropagation();
        },
        onTouchStart: (event: React.TouchEvent) => {
            hidePopover();
            event.stopPropagation();
        },
    };
    const isHighlighted = useIsControlTileHighlighted(tile.uuid);
    const ref = useRef<HTMLDivElement>(null);

    // A clicked tile count brings one of its tiles into view, once, also when
    // the click switched to the tab this tile is on. Hovering never scrolls,
    // nor does coming back to the tab later.
    useEffect(() => {
        const element = ref.current;
        if (!element || scrollRequest?.tileUuid !== tile.uuid) return;
        if (!takeScrollRequest(scrollRequest)) return;
        // The tabs and the filter bar stick to the top and their height
        // varies, so the tile is placed below wherever they end
        const sticky = document.querySelector(STICKY_BAR_SELECTOR);
        const top =
            (sticky?.getBoundingClientRect().bottom ?? 0) + SCROLL_GAP_PX;
        const rect = element.getBoundingClientRect();
        if (rect.top >= top && rect.bottom <= window.innerHeight) return;
        window.scrollBy({ top: rect.top - top, behavior: 'smooth' });
    }, [scrollRequest, takeScrollRequest, tile.uuid]);
    const isPreviewed = previewTileUuids.includes(tile.uuid);

    return (
        <Paper
            ref={ref}
            variant="dotted"
            className={clsx(
                classes.tile,
                isHighlighted && classes.tileHighlighted,
            )}
        >
            <Stack gap="xs" h="100%">
                <Text fw={600} fz="sm" truncate flex="0 0 auto">
                    {getTileTitle(tile)}
                </Text>
                {isPreviewed ? (
                    <>
                        <Box
                            className={clsx('non-draggable', classes.tileBody)}
                            {...stopDrag}
                        >
                            <ControlTileMapping tile={tile} />
                        </Box>
                        <Box
                            className={clsx(
                                'non-draggable',
                                classes.tilePreview,
                            )}
                        >
                            {/* The tile as the draft would run it */}
                            <ControlPreviewScope>
                                {children}
                            </ControlPreviewScope>
                        </Box>
                    </>
                ) : (
                    <Box className={clsx('non-draggable', classes.tileStage)}>
                        {/* The tile as the dashboard runs it now, to look at only */}
                        <Box className={classes.tileBackdrop} inert aria-hidden>
                            {children}
                        </Box>
                        <Box className={classes.tileBlockLayer}>
                            <Box className={classes.tileBlock} {...stopDrag}>
                                <ControlTileMapping tile={tile} />
                            </Box>
                        </Box>
                    </Box>
                )}
            </Stack>
        </Paper>
    );
};

export default ControlTile;
