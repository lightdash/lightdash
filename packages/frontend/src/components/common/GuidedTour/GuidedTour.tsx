import {
    Box,
    Button,
    Group,
    Paper,
    Portal,
    Stack,
    Text,
} from '@mantine-8/core';
import { clsx } from '@mantine/core';
import { type FC, type ReactNode, useEffect, useState } from 'react';
import styles from './GuidedTour.module.css';

export type GuidedTourStep = {
    /** CSS selector resolved at step time; null renders a centered explainer. */
    target: string | null;
    title: string;
    body: ReactNode;
};

type GuidedTourProps = {
    steps: GuidedTourStep[];
    opened: boolean;
    onClose: () => void;
};

const SPOTLIGHT_PADDING = 6;
const VIEWPORT_MARGIN = 12;
/** Space between the spotlight and the card, enough to fit the caret. */
const CARD_GAP = 14;
const CARD_MIN_WIDTH = 340;
const CARD_MAX_WIDTH = 480;
/** Used until the card has been measured. */
const CARD_FALLBACK_HEIGHT = 220;

/** Track a target element's viewport rect while the tour is open. */
const useTargetRect = (
    selector: string | null,
    active: boolean,
): DOMRect | null => {
    const [rect, setRect] = useState<DOMRect | null>(null);

    useEffect(() => {
        if (!active || !selector) {
            setRect(null);
            return;
        }
        let el: Element | null = null;
        const measure = () => {
            if (el) setRect(el.getBoundingClientRect());
        };
        // The target may render after the step is shown (data still loading),
        // so keep looking for it, then keep its rect in sync with layout.
        const tick = () => {
            if (!el) {
                el = document.querySelector(selector);
                if (el) {
                    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                }
            }
            measure();
        };
        tick();
        const poll = window.setInterval(tick, 150);
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        return () => {
            window.clearInterval(poll);
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
        };
    }, [selector, active]);

    return rect;
};

/** Keep the rendered card's height so it can be flipped without guessing. */
const useCardHeight = (): [number, (el: HTMLDivElement | null) => void] => {
    const [height, setHeight] = useState(CARD_FALLBACK_HEIGHT);
    const [el, setEl] = useState<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!el) return;
        const observer = new ResizeObserver(() => {
            setHeight(el.getBoundingClientRect().height);
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [el]);

    return [height, setEl];
};

type CardLayout = {
    top: number;
    left: number;
    width: number;
    placement: 'below' | 'above';
    /** Caret offset from the card's left edge, aimed at the target's centre. */
    caretLeft: number;
};

/**
 * Sit the card under the target, spanning as much of the target's width as it
 * can so a wide banner doesn't get a lone card tucked in its corner. Flips
 * above only when the card genuinely doesn't fit below.
 */
const cardLayout = (rect: DOMRect, cardHeight: number): CardLayout => {
    const available = window.innerWidth - VIEWPORT_MARGIN * 2;
    const width = Math.min(
        Math.max(CARD_MIN_WIDTH, rect.width),
        CARD_MAX_WIDTH,
        available,
    );
    const fitsBelow =
        rect.bottom + CARD_GAP + cardHeight + VIEWPORT_MARGIN <=
        window.innerHeight;
    const fitsAbove = rect.top - CARD_GAP - cardHeight >= VIEWPORT_MARGIN;
    const placement = fitsBelow || !fitsAbove ? 'below' : 'above';
    const top =
        placement === 'below'
            ? rect.bottom + CARD_GAP
            : rect.top - CARD_GAP - cardHeight;
    const targetCentre = rect.left + rect.width / 2;
    const left = Math.min(
        Math.max(VIEWPORT_MARGIN, targetCentre - width / 2),
        window.innerWidth - width - VIEWPORT_MARGIN,
    );
    return {
        top,
        left,
        width,
        placement,
        caretLeft: Math.min(Math.max(20, targetCentre - left), width - 20),
    };
};

export const GuidedTour: FC<GuidedTourProps> = ({ steps, opened, onClose }) => {
    const [stepIndex, setStepIndex] = useState(0);
    const [cardHeight, cardRef] = useCardHeight();

    const step = steps[stepIndex];
    // Each step resolves its own target when reached (rows may load late), so a
    // step with a not-yet-rendered target just shows a centered card until it
    // appears, rather than being dropped.
    const rect = useTargetRect(opened ? (step?.target ?? null) : null, opened);

    if (!opened || !step) return null;

    const isFirst = stepIndex === 0;
    const isLast = stepIndex === steps.length - 1;
    const layout = rect ? cardLayout(rect, cardHeight) : null;

    const handleClose = () => {
        setStepIndex(0);
        onClose();
    };
    const handleNext = () =>
        isLast ? handleClose() : setStepIndex((i) => i + 1);
    const handleBack = () => setStepIndex((i) => Math.max(0, i - 1));

    const cardBody = (
        <Paper
            ref={cardRef}
            radius="md"
            p="md"
            withBorder={false}
            className={styles.paper}
        >
            {layout && (
                <Box
                    className={clsx(
                        styles.caret,
                        layout.placement === 'below'
                            ? styles.caretTop
                            : styles.caretBottom,
                    )}
                    __vars={{ '--tour-caret-left': `${layout.caretLeft}px` }}
                />
            )}
            <Stack gap="sm">
                <Stack gap={6}>
                    <Text className={styles.eyebrow}>
                        Step {stepIndex + 1} of {steps.length}
                    </Text>
                    <Text fw={600} fz="md" lh={1.3}>
                        {step.title}
                    </Text>
                    <Box fz="sm" c="dimmed">
                        {step.body}
                    </Box>
                </Stack>
                <Group justify="space-between" align="center">
                    <Button
                        variant="subtle"
                        color="gray"
                        size="compact-sm"
                        onClick={handleClose}
                    >
                        Skip
                    </Button>
                    <Box className={styles.dots}>
                        {steps.map((s, i) => (
                            <Box
                                key={s.title}
                                className={clsx(
                                    styles.dot,
                                    i === stepIndex && styles.dotActive,
                                )}
                            />
                        ))}
                    </Box>
                    <Group gap="xs">
                        {!isFirst && (
                            <Button
                                variant="default"
                                size="compact-sm"
                                onClick={handleBack}
                            >
                                Back
                            </Button>
                        )}
                        <Button size="compact-sm" onClick={handleNext}>
                            {isLast ? 'Got it' : 'Next'}
                        </Button>
                    </Group>
                </Group>
            </Stack>
        </Paper>
    );

    return (
        <Portal>
            <Box className={styles.root}>
                <Box className={styles.blocker} />
                {rect ? (
                    <Box
                        className={styles.spotlight}
                        __vars={{
                            '--tour-top': `${rect.top - SPOTLIGHT_PADDING}px`,
                            '--tour-left': `${rect.left - SPOTLIGHT_PADDING}px`,
                            '--tour-width': `${
                                rect.width + SPOTLIGHT_PADDING * 2
                            }px`,
                            '--tour-height': `${
                                rect.height + SPOTLIGHT_PADDING * 2
                            }px`,
                        }}
                    />
                ) : (
                    <Box className={styles.dim} />
                )}
                {layout ? (
                    <Box
                        className={styles.card}
                        __vars={{
                            '--tour-card-top': `${layout.top}px`,
                            '--tour-card-left': `${layout.left}px`,
                            '--tour-card-width': `${layout.width}px`,
                        }}
                    >
                        {cardBody}
                    </Box>
                ) : (
                    <Box className={styles.cardCentered}>{cardBody}</Box>
                )}
            </Box>
        </Portal>
    );
};
