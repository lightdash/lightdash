import { Box, Tooltip } from '@mantine/core';
import { useDrag } from '@mantine/hooks';
import {
    useRef,
    type CSSProperties,
    type FC,
    type KeyboardEvent,
    type PropsWithChildren,
} from 'react';
import styles from './AiAgentsLauncher.module.css';
import {
    clampLauncherPanelSize,
    LAUNCHER_PANEL_KEYBOARD_STEP,
    type LauncherPanelSize,
} from './launcherPanelSize';
import { useLauncherPanelSizeContext } from './LauncherPanelSizeContext';

type Props = PropsWithChildren<{ style?: CSSProperties }>;

// Arrow keys move the top-left corner, so left and up grow the panel.
const KEY_DIRECTIONS: Record<string, readonly [number, number]> = {
    ArrowLeft: [1, 0],
    ArrowRight: [-1, 0],
    ArrowUp: [0, 1],
    ArrowDown: [0, -1],
};

const getViewport = () => ({
    width: window.innerWidth,
    height: window.innerHeight,
});

const measure = (element: HTMLElement | null): LauncherPanelSize | null => {
    if (!element) return null;
    const { width, height } = element.getBoundingClientRect();
    return { width, height };
};

export const LauncherPanelFrame: FC<Props> = ({ style, children }) => {
    const { previewSize, commitSize } = useLauncherPanelSizeContext();
    const frameRef = useRef<HTMLDivElement>(null);
    const dragStartSizeRef = useRef<LauncherPanelSize | null>(null);

    // The panel is anchored bottom-right, so dragging the corner up or left
    // grows it.
    const { ref: handleRef } = useDrag(
        ({ first, last, movement: [dx, dy], distance, event }) => {
            if (first) {
                dragStartSizeRef.current = measure(frameRef.current);
                (event.currentTarget as HTMLElement | null)?.setPointerCapture(
                    event.pointerId,
                );
                return;
            }
            const start = dragStartSizeRef.current;
            if (!start) return;
            const size = clampLauncherPanelSize(
                { width: start.width - dx, height: start.height - dy },
                getViewport(),
            );
            if (!last) {
                previewSize(size);
                return;
            }
            dragStartSizeRef.current = null;
            if (distance[0] > 0 || distance[1] > 0) commitSize(size);
        },
    );

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const direction = KEY_DIRECTIONS[event.key];
        const current = measure(frameRef.current);
        if (!direction || !current) return;
        event.preventDefault();
        const step = LAUNCHER_PANEL_KEYBOARD_STEP * (event.shiftKey ? 4 : 1);
        commitSize(
            clampLauncherPanelSize(
                {
                    width: current.width + direction[0] * step,
                    height: current.height + direction[1] * step,
                },
                getViewport(),
            ),
        );
    };

    return (
        <Box ref={frameRef} className={styles.panel} style={style}>
            {children}
            <Tooltip
                label="Drag to resize, double-click to reset"
                openDelay={400}
            >
                <Box
                    ref={handleRef}
                    role="separator"
                    aria-label="Resize panel"
                    tabIndex={0}
                    className={styles.resizeHandle}
                    onDoubleClick={() => commitSize(null)}
                    onKeyDown={handleKeyDown}
                />
            </Tooltip>
        </Box>
    );
};
