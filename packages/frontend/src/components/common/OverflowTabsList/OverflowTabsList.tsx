import { Box, Tabs, UnstyledButton, type BoxProps } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { clsx } from 'clsx';
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import MantineIcon from '../MantineIcon';
import classes from './OverflowTabsList.module.css';

type Props = BoxProps & {
    /** `Tabs.Tab` children; the list itself is rendered here. */
    children: ReactNode;
};

/** How much of the strip one arrow click travels. */
const SCROLL_STEP_RATIO = 0.8;
/** `scrollWidth` is rounded while `scrollLeft` is not, so the ends need slack
 *  — without it the trailing arrow can survive a scroll to the very end. */
const EDGE_TOLERANCE_PX = 2;

/**
 * A `Tabs.List` for narrow columns: too many tabs scroll sideways instead of
 * wrapping, with a fading arrow at whichever edge still has tabs behind it.
 * Mounts scrolled to the active tab, so a tab selected off-screen is not
 * invisible.
 */
const OverflowTabsList: FC<Props> = ({ children, className, ...boxProps }) => {
    const listRef = useRef<HTMLDivElement>(null);
    const [edges, setEdges] = useState({ start: false, end: false });

    const measure = useCallback(() => {
        const list = listRef.current;
        if (!list) return;
        const start = list.scrollLeft > EDGE_TOLERANCE_PX;
        const end =
            list.scrollLeft + list.clientWidth <
            list.scrollWidth - EDGE_TOLERANCE_PX;
        // Same object when nothing moved, so this cannot loop on itself.
        setEdges((prev) =>
            prev.start === start && prev.end === end ? prev : { start, end },
        );
    }, []);

    // Tab labels come from generated declarations, so the overflow can change
    // on any render, not just on resize.
    useEffect(measure);

    useEffect(() => {
        const list = listRef.current;
        if (!list) return;
        // Scrolled by hand: `scrollIntoView` would also nudge every
        // scrollable ancestor, including clipped panels that cannot scroll back.
        const active = list.querySelector<HTMLElement>('[data-active]');
        if (active) {
            const start = active.offsetLeft - list.offsetLeft;
            const end = start + active.offsetWidth;
            if (start < list.scrollLeft) list.scrollLeft = start;
            else if (end > list.scrollLeft + list.clientWidth)
                list.scrollLeft = end - list.clientWidth;
        }
        const observer = new ResizeObserver(measure);
        observer.observe(list);
        list.addEventListener('scroll', measure, { passive: true });
        return () => {
            observer.disconnect();
            list.removeEventListener('scroll', measure);
        };
    }, [measure]);

    const step = (direction: -1 | 1) => {
        const list = listRef.current;
        if (!list) return;
        list.scrollBy({
            left: direction * list.clientWidth * SCROLL_STEP_RATIO,
            behavior: 'smooth',
        });
    };

    return (
        <Box className={clsx(classes.wrapper, className)} {...boxProps}>
            <Box className={classes.viewport}>
                <Tabs.List ref={listRef} className={classes.list}>
                    {children}
                </Tabs.List>
                {edges.start && (
                    <Box className={classes.fadeStart}>
                        <UnstyledButton
                            className={classes.arrow}
                            aria-label="Scroll tabs left"
                            onClick={() => step(-1)}
                        >
                            <MantineIcon
                                icon={IconChevronLeft}
                                size={14}
                                color="dimmed"
                            />
                        </UnstyledButton>
                    </Box>
                )}
                {edges.end && (
                    <Box className={classes.fadeEnd}>
                        <UnstyledButton
                            className={classes.arrow}
                            aria-label="Scroll tabs right"
                            onClick={() => step(1)}
                        >
                            <MantineIcon
                                icon={IconChevronRight}
                                size={14}
                                color="dimmed"
                            />
                        </UnstyledButton>
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export default OverflowTabsList;
