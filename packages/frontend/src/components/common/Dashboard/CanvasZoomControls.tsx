import { ActionIcon, Button, Group, Tooltip } from '@mantine/core';
import { IconArrowsMinimize, IconMinus, IconPlus } from '@tabler/icons-react';
import { memo, useCallback } from 'react';
import {
    dashboardEditActions,
    selectCanvasZoom,
    useDashboardDispatch,
    useDashboardSelector,
} from '../../../features/dashboard/store';
import MantineIcon from '../MantineIcon';

const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1];
const MIN_ZOOM = ZOOM_STEPS[0];
// Room under the canvas for the floating bar when fitting
const FIT_BOTTOM_CLEARANCE = 96;

const nextStep = (zoom: number, direction: 'in' | 'out') =>
    direction === 'in'
        ? (ZOOM_STEPS.find((step) => step > zoom + 0.001) ?? 1)
        : (ZOOM_STEPS.findLast((step) => step < zoom - 0.001) ?? MIN_ZOOM);

const getScrollParent = (element: HTMLElement): HTMLElement | null => {
    let parent = element.parentElement;
    while (parent !== null) {
        const { overflowY } = getComputedStyle(parent);
        if (overflowY === 'auto' || overflowY === 'scroll') return parent;
        parent = parent.parentElement;
    }
    return null;
};

// The zoom that shows the whole active grid in the window
const getFitZoom = (): number | null => {
    const canvas = Array.from(
        document.querySelectorAll<HTMLElement>('[data-canvas-zoom]'),
    ).find((element) => element.offsetParent !== null);
    const content = canvas?.firstElementChild;
    if (!canvas || !(content instanceof HTMLElement)) return null;
    (getScrollParent(canvas) ?? document.documentElement).scrollTo({ top: 0 });
    const available =
        window.innerHeight -
        canvas.getBoundingClientRect().top -
        FIT_BOTTOM_CLEARANCE;
    const fit = available / content.offsetHeight;
    return Math.min(1, Math.max(MIN_ZOOM, Math.floor(fit * 100) / 100));
};

export const CanvasZoomControls = memo(() => {
    const dispatch = useDashboardDispatch();
    const zoom = useDashboardSelector(selectCanvasZoom);
    const setZoom = useCallback(
        (value: number) => dispatch(dashboardEditActions.setCanvasZoom(value)),
        [dispatch],
    );
    const fit = useCallback(() => {
        const fitZoom = getFitZoom();
        if (fitZoom !== null) setZoom(fitZoom);
    }, [setZoom]);

    return (
        <Group gap={2} wrap="nowrap">
            <Tooltip label="Zoom out">
                <ActionIcon
                    size="md"
                    aria-label="Zoom out"
                    disabled={zoom <= MIN_ZOOM}
                    onClick={() => setZoom(nextStep(zoom, 'out'))}
                >
                    <MantineIcon icon={IconMinus} />
                </ActionIcon>
            </Tooltip>
            <Tooltip label="Reset to 100%" disabled={zoom === 1}>
                <Button
                    variant="subtle"
                    size="xs"
                    px={4}
                    miw={44}
                    onClick={() => setZoom(1)}
                >
                    {Math.round(zoom * 100)}%
                </Button>
            </Tooltip>
            <Tooltip label="Zoom in">
                <ActionIcon
                    size="md"
                    aria-label="Zoom in"
                    disabled={zoom >= 1}
                    onClick={() => setZoom(nextStep(zoom, 'in'))}
                >
                    <MantineIcon icon={IconPlus} />
                </ActionIcon>
            </Tooltip>
            <Tooltip label="Fit the dashboard to the window">
                <ActionIcon size="md" aria-label="Zoom to fit" onClick={fit}>
                    <MantineIcon icon={IconArrowsMinimize} />
                </ActionIcon>
            </Tooltip>
        </Group>
    );
});
CanvasZoomControls.displayName = 'CanvasZoomControls';
