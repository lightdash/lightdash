import { ActionIcon, Button, Group, Tooltip } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import {
    IconArrowsMaximize,
    IconArrowsMinimize,
    IconMinus,
    IconPlus,
} from '@tabler/icons-react';
import { memo, useCallback, useState } from 'react';
import {
    dashboardEditActions,
    selectCanvasZoom,
    useDashboardDispatch,
    useDashboardSelector,
} from '../../../features/dashboard/store';
import {
    ACTUAL_SIZE_ZOOM,
    fitVisibleCanvasToWindow,
    MIN_CANVAS_ZOOM,
    stepCanvasZoom,
} from '../../../features/dashboardTabs/canvasZoomUtils';
import MantineIcon from '../MantineIcon';
import { EDIT_SHORTCUTS, toHotkeyItems } from './editShortcuts';
import { ShortcutHint, ShortcutTooltipLabel } from './ShortcutHint';

export const CanvasZoomControls = memo(() => {
    const dispatch = useDashboardDispatch();
    const zoom = useDashboardSelector(selectCanvasZoom);
    const setZoom = useCallback(
        (value: number) => dispatch(dashboardEditActions.setCanvasZoom(value)),
        [dispatch],
    );
    const zoomOut = () => setZoom(stepCanvasZoom(zoom, 'out'));
    const zoomIn = () => setZoom(stepCanvasZoom(zoom, 'in'));
    const reset = () => setZoom(ACTUAL_SIZE_ZOOM);
    const [fitted, setFitted] = useState<{
        zoom: number;
        zoomBefore: number;
    } | null>(null);
    // Any other zoom step leaves the fitted view
    const isFitted = fitted !== null && fitted.zoom === zoom;
    const toggleFit = () => {
        if (isFitted) {
            setFitted(null);
            setZoom(fitted.zoomBefore);
            return;
        }
        const fitZoom = fitVisibleCanvasToWindow();
        if (fitZoom === null || fitZoom === zoom) return;
        setFitted({ zoom: fitZoom, zoomBefore: zoom });
        setZoom(fitZoom);
    };
    const fitLabel = isFitted
        ? `Back to ${Math.round(fitted.zoomBefore * 100)}%`
        : 'Zoom to fit';

    useHotkeys([
        ...toHotkeyItems(EDIT_SHORTCUTS.zoomOut, zoomOut),
        ...toHotkeyItems(EDIT_SHORTCUTS.zoomReset, reset),
        ...toHotkeyItems(EDIT_SHORTCUTS.zoomIn, zoomIn),
        ...toHotkeyItems(EDIT_SHORTCUTS.zoomToFit, toggleFit),
    ]);

    return (
        <Group gap="xxs" wrap="nowrap">
            <ShortcutHint shortcut={EDIT_SHORTCUTS.zoomOut} position="top">
                <Tooltip
                    label={
                        <ShortcutTooltipLabel
                            label="Zoom out"
                            shortcut={EDIT_SHORTCUTS.zoomOut}
                        />
                    }
                >
                    <ActionIcon
                        size="md"
                        aria-label="Zoom out"
                        disabled={zoom <= MIN_CANVAS_ZOOM}
                        onClick={zoomOut}
                    >
                        <MantineIcon icon={IconMinus} />
                    </ActionIcon>
                </Tooltip>
            </ShortcutHint>
            <ShortcutHint shortcut={EDIT_SHORTCUTS.zoomReset} position="top">
                <Tooltip
                    label={
                        <ShortcutTooltipLabel
                            label="Reset to 100%"
                            shortcut={EDIT_SHORTCUTS.zoomReset}
                        />
                    }
                    disabled={zoom === ACTUAL_SIZE_ZOOM}
                >
                    <Button
                        variant="subtle"
                        size="xs"
                        px="xxs"
                        // Widest label, so the bar keeps its width between steps
                        miw={44}
                        onClick={reset}
                    >
                        {Math.round(zoom * 100)}%
                    </Button>
                </Tooltip>
            </ShortcutHint>
            <ShortcutHint shortcut={EDIT_SHORTCUTS.zoomIn} position="top">
                <Tooltip
                    label={
                        <ShortcutTooltipLabel
                            label="Zoom in"
                            shortcut={EDIT_SHORTCUTS.zoomIn}
                        />
                    }
                >
                    <ActionIcon
                        size="md"
                        aria-label="Zoom in"
                        disabled={zoom >= ACTUAL_SIZE_ZOOM}
                        onClick={zoomIn}
                    >
                        <MantineIcon icon={IconPlus} />
                    </ActionIcon>
                </Tooltip>
            </ShortcutHint>
            <ShortcutHint shortcut={EDIT_SHORTCUTS.zoomToFit} position="top">
                <Tooltip
                    label={
                        <ShortcutTooltipLabel
                            label={fitLabel}
                            shortcut={EDIT_SHORTCUTS.zoomToFit}
                        />
                    }
                >
                    <ActionIcon
                        size="md"
                        aria-label={fitLabel}
                        aria-pressed={isFitted}
                        variant={isFitted ? 'light' : 'subtle'}
                        onClick={toggleFit}
                    >
                        <MantineIcon
                            icon={
                                isFitted
                                    ? IconArrowsMaximize
                                    : IconArrowsMinimize
                            }
                        />
                    </ActionIcon>
                </Tooltip>
            </ShortcutHint>
        </Group>
    );
});
CanvasZoomControls.displayName = 'CanvasZoomControls';
