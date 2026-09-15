import { Box, Tooltip } from '@mantine/core';
import { useDrag } from '@mantine/hooks';
import {
    useEffect,
    useRef,
    useState,
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

// Mirrors the CSS clamps: a page margin on each side, and a gap below the navbar.
const PAGE_MARGIN = 32;
const NAVBAR_GAP = 8;

const HINT_TIMEOUT_MS = 3000;

// The navbar's bottom edge already sits below any banner shown above it.
const readTopInset = () => {
    const navbar = document.querySelector('#navbar-header header');
    return navbar ? Math.max(0, navbar.getBoundingClientRect().bottom) : 0;
};

const measure = (frame: HTMLElement) => {
    const rect = frame.getBoundingClientRect();
    const size: LauncherPanelSize = { width: rect.width, height: rect.height };
    // The panel grows upwards from a fixed bottom edge, so the room above it
    // is what's left between that edge and the navbar.
    const available: LauncherPanelSize = {
        width: window.innerWidth - PAGE_MARGIN,
        height: rect.bottom - readTopInset() - NAVBAR_GAP,
    };
    return { size, available };
};

export const LauncherPanelFrame: FC<Props> = ({ style, children }) => {
    const { previewSize, commitSize, resizeHintSeen, markResizeHintSeen } =
        useLauncherPanelSizeContext();
    const frameRef = useRef<HTMLDivElement>(null);
    const dragStartRef = useRef<ReturnType<typeof measure> | null>(null);

    // The hint is shown once: it closes on leave, on timeout or on the first
    // resize, and is never shown again after that.
    const [hintOpen, setHintOpen] = useState(false);
    const closeHint = () => {
        if (!hintOpen) return;
        setHintOpen(false);
        markResizeHintSeen();
    };
    useEffect(() => {
        if (!hintOpen) return;
        const timer = window.setTimeout(() => {
            setHintOpen(false);
            markResizeHintSeen();
        }, HINT_TIMEOUT_MS);
        return () => window.clearTimeout(timer);
    }, [hintOpen, markResizeHintSeen]);

    // The panel is anchored bottom-right, so dragging the corner up or left
    // grows it.
    const { ref: handleRef } = useDrag(
        ({ first, last, movement: [dx, dy], distance, event }) => {
            if (first) {
                dragStartRef.current = frameRef.current
                    ? measure(frameRef.current)
                    : null;
                (event.currentTarget as HTMLElement | null)?.setPointerCapture(
                    event.pointerId,
                );
                return;
            }
            const start = dragStartRef.current;
            if (!start) return;
            const size = clampLauncherPanelSize(
                {
                    width: start.size.width - dx,
                    height: start.size.height - dy,
                },
                start.available,
            );
            if (!last) {
                previewSize(size);
                return;
            }
            dragStartRef.current = null;
            if (distance[0] > 0 || distance[1] > 0) {
                setHintOpen(false);
                commitSize(size);
            }
        },
    );

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const direction = KEY_DIRECTIONS[event.key];
        if (!direction || !frameRef.current) return;
        event.preventDefault();
        const { size, available } = measure(frameRef.current);
        const step = LAUNCHER_PANEL_KEYBOARD_STEP * (event.shiftKey ? 4 : 1);
        commitSize(
            clampLauncherPanelSize(
                {
                    width: size.width + direction[0] * step,
                    height: size.height + direction[1] * step,
                },
                available,
            ),
        );
    };

    return (
        <Box ref={frameRef} className={styles.panel} style={style}>
            {children}
            <Tooltip
                label="Drag to resize, double-click to reset"
                opened={hintOpen}
            >
                <Box
                    ref={handleRef}
                    role="separator"
                    aria-label="Resize panel"
                    tabIndex={0}
                    className={styles.resizeHandle}
                    onPointerEnter={() => {
                        if (!resizeHintSeen) setHintOpen(true);
                    }}
                    onPointerLeave={closeHint}
                    onDoubleClick={() => commitSize(null)}
                    onKeyDown={handleKeyDown}
                />
            </Tooltip>
        </Box>
    );
};
