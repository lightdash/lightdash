import { ActionIcon, Button, Group, Tooltip } from '@mantine/core';
import { IconArrowsMinimize, IconMinus, IconPlus } from '@tabler/icons-react';
import { memo, useCallback } from 'react';
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

export const CanvasZoomControls = memo(() => {
    const dispatch = useDashboardDispatch();
    const zoom = useDashboardSelector(selectCanvasZoom);
    const setZoom = useCallback(
        (value: number) => dispatch(dashboardEditActions.setCanvasZoom(value)),
        [dispatch],
    );
    const fit = useCallback(() => {
        const fitZoom = fitVisibleCanvasToWindow();
        if (fitZoom !== null) setZoom(fitZoom);
    }, [setZoom]);

    return (
        <Group gap="xxs" wrap="nowrap">
            <Tooltip label="Zoom out">
                <ActionIcon
                    size="md"
                    aria-label="Zoom out"
                    disabled={zoom <= MIN_CANVAS_ZOOM}
                    onClick={() => setZoom(stepCanvasZoom(zoom, 'out'))}
                >
                    <MantineIcon icon={IconMinus} />
                </ActionIcon>
            </Tooltip>
            <Tooltip label="Reset to 100%" disabled={zoom === ACTUAL_SIZE_ZOOM}>
                <Button
                    variant="subtle"
                    size="xs"
                    px="xxs"
                    // Widest label, so the bar keeps its width between steps
                    miw={44}
                    onClick={() => setZoom(ACTUAL_SIZE_ZOOM)}
                >
                    {Math.round(zoom * 100)}%
                </Button>
            </Tooltip>
            <Tooltip label="Zoom in">
                <ActionIcon
                    size="md"
                    aria-label="Zoom in"
                    disabled={zoom >= ACTUAL_SIZE_ZOOM}
                    onClick={() => setZoom(stepCanvasZoom(zoom, 'in'))}
                >
                    <MantineIcon icon={IconPlus} />
                </ActionIcon>
            </Tooltip>
            <Tooltip label="Zoom to fit">
                <ActionIcon size="md" aria-label="Zoom to fit" onClick={fit}>
                    <MantineIcon icon={IconArrowsMinimize} />
                </ActionIcon>
            </Tooltip>
        </Group>
    );
});
CanvasZoomControls.displayName = 'CanvasZoomControls';
