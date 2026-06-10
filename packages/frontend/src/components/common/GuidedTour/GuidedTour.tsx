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

/** Position the card below the target, flipping above when it would overflow. */
const cardPosition = (rect: DOMRect): { top: number; left: number } => {
    const margin = 12;
    const cardWidth = 340;
    const estHeight = 200;
    const below = rect.bottom + margin;
    const top =
        below + estHeight > window.innerHeight
            ? Math.max(margin, rect.top - estHeight - margin)
            : below;
    const left = Math.min(
        Math.max(margin, rect.left),
        window.innerWidth - cardWidth - margin,
    );
    return { top, left };
};

export const GuidedTour: FC<GuidedTourProps> = ({ steps, opened, onClose }) => {
    const [stepIndex, setStepIndex] = useState(0);

    const step = steps[stepIndex];
    // Each step resolves its own target when reached (rows may load late), so a
    // step with a not-yet-rendered target just shows a centered card until it
    // appears, rather than being dropped.
    const rect = useTargetRect(opened ? (step?.target ?? null) : null, opened);

    if (!opened || !step) return null;

    const isFirst = stepIndex === 0;
    const isLast = stepIndex === steps.length - 1;

    const handleClose = () => {
        setStepIndex(0);
        onClose();
    };
    const handleNext = () =>
        isLast ? handleClose() : setStepIndex((i) => i + 1);
    const handleBack = () => setStepIndex((i) => Math.max(0, i - 1));

    const cardBody = (
        <Paper withBorder shadow="lg" radius="md" p="md">
            <Stack gap="sm">
                <Stack gap={4}>
                    <Text fw={600} fz="sm">
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
                        size="compact-xs"
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
                                size="compact-xs"
                                onClick={handleBack}
                            >
                                Back
                            </Button>
                        )}
                        <Button size="compact-xs" onClick={handleNext}>
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
                {rect ? (
                    <Box
                        className={styles.card}
                        __vars={{
                            '--tour-card-top': `${cardPosition(rect).top}px`,
                            '--tour-card-left': `${cardPosition(rect).left}px`,
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
