import { Text } from '@mantine/core';
import { useEffect, useState, type FC } from 'react';
import classes from './ToolActivityBadge.module.css';

const FALLBACK_LABEL = 'Autopilot is working';

const stripTrailingEllipsis = (s: string) => s.replace(/[…\.]+$/, '').trimEnd();

// Between tool calls the label falls back to a single word instead of the
// last activity, which would otherwise look stuck.
const IDLE_THRESHOLD_MS = 4000;
const THINKING_LABEL = 'Thinking';

const AnimatedDots: FC = () => (
    <span className={classes.dots} aria-hidden>
        <span className={classes.dot}>.</span>
        <span className={classes.dot}>.</span>
        <span className={classes.dot}>.</span>
    </span>
);

export const ToolActivityBadge: FC<{ currentActivity: string | null }> = ({
    currentActivity,
}) => {
    const [isIdle, setIsIdle] = useState(false);

    useEffect(() => {
        setIsIdle(false);
        const idleTimeout = setTimeout(
            () => setIsIdle(true),
            IDLE_THRESHOLD_MS,
        );
        return () => clearTimeout(idleTimeout);
    }, [currentActivity]);

    const label = isIdle
        ? THINKING_LABEL
        : stripTrailingEllipsis(currentActivity ?? FALLBACK_LABEL);
    return (
        <Text fz={13} c="dimmed" role="status" aria-live="polite">
            <span key={label} className={classes.activityText}>
                {label}
            </span>
            {/* Visually-hidden ellipsis so screen readers say
                "Looking for stale charts…" instead of "dot dot dot". */}
            <span className={classes.srOnlyEllipsis}>…</span>
            <AnimatedDots />
        </Text>
    );
};
