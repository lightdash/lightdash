import { Box, Button, Group, Paper, Portal, Stack, Text } from '@mantine/core';
import { clsx } from 'clsx';
import { type FC, type ReactNode, useEffect, useState } from 'react';
import { cardLayout } from './cardLayout';
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
    /**
     * Fired when the user navigates to another step (Next/Back), with the new
     * step index. Not fired on close, so side effects (e.g. a modal a step
     * opened) survive finishing the tour.
     */
    onStepChange?: (stepIndex: number) => void;
};

const SPOTLIGHT_PADDING = 6;
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

export const GuidedTour: FC<GuidedTourProps> = ({
    steps,
    opened,
    onClose,
    onStepChange,
}) => {
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
    const goToStep = (index: number) => {
        setStepIndex(index);
        onStepChange?.(index);
    };
    const handleNext = () => (isLast ? handleClose() : goToStep(stepIndex + 1));
    const handleBack = () => goToStep(Math.max(0, stepIndex - 1));

    const cardBody = (
        <Paper
            ref={cardRef}
            radius="md"
            p="md"
            withBorder={false}
            className={styles.paper}
        >
            {layout && layout.placement !== 'inside' && (
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
