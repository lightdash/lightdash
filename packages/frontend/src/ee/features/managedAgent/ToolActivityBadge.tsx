import { Box, Text } from '@mantine-8/core';
import {
    IconAlertTriangle,
    IconArrowBackUp,
    IconBolt,
    IconBulb,
    IconChartBar,
    IconClock,
    IconDatabase,
    IconEye,
    IconFlag,
    IconFolder,
    IconHistory,
    IconLayoutDashboard,
    IconMessageQuestion,
    IconPlus,
    IconStar,
    IconTool,
    IconTrash,
} from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import classes from './ToolActivityBadge.module.css';

// Mirrors backend FRIENDLY_TOOL_LABELS values from
// packages/backend/src/ee/services/ManagedAgentService/ManagedAgentService.ts.
// Out-of-map labels fall back to IconBolt.
const ACTIVITY_ICON: Record<string, typeof IconBolt> = {
    'Reviewing recent activity': IconHistory,
    'Looking for stale charts': IconChartBar,
    'Looking for stale dashboards': IconLayoutDashboard,
    'Looking for broken content': IconAlertTriangle,
    'Inspecting preview projects': IconFolder,
    'Checking popular content': IconStar,
    'Inspecting chart details': IconEye,
    'Loading chart schema': IconDatabase,
    'Flagging content': IconFlag,
    'Cleaning up stale content': IconTrash,
    'Logging an insight': IconBulb,
    'Fixing a broken chart': IconTool,
    'Creating chart suggestion': IconPlus,
    'Reviewing user questions': IconMessageQuestion,
    'Checking slow queries': IconClock,
    'Reverting earlier change': IconArrowBackUp,
};

const iconFor = (label: string) => ACTIVITY_ICON[label] ?? IconBolt;

const FALLBACK_LABEL = 'Autopilot is working';

const stripTrailingEllipsis = (s: string) => s.replace(/[…\.]+$/, '').trimEnd();

// Rotated when the agent is between tool calls (LLM thinking time).
// Snaps back to the real activity label as soon as a new tool fires.
const THINKING_VERBS = [
    'Pondering',
    'Synthesizing',
    'Reasoning',
    'Cross-referencing',
    'Reflecting',
    'Analyzing',
    'Connecting metrics',
    'Weighing options',
    'Mulling it over',
    'Tracing patterns',
    'Triangulating',
    'Distilling',
    'Zapping',
    'Lightdashing',
    'Sparking insights',
    'Crunching numbers',
    'Following the data',
    'Exploring',
    'Refactoring',
    'Tidying up',
    'Pruning',
    'Auditing',
    'Triaging',
];

const IDLE_THRESHOLD_MS = 4000;
const ROTATE_INTERVAL_MS = 2500;

const pickRandomVerb = (exclude: string | null): string => {
    const pool = exclude
        ? THINKING_VERBS.filter((v) => v !== exclude)
        : THINKING_VERBS;
    return pool[Math.floor(Math.random() * pool.length)];
};

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
    const [thinkingVerb, setThinkingVerb] = useState<string | null>(null);

    useEffect(() => {
        setThinkingVerb(null);
        let rotateInterval: ReturnType<typeof setInterval> | null = null;
        const startTimeout = setTimeout(() => {
            setThinkingVerb(pickRandomVerb(null));
            rotateInterval = setInterval(() => {
                setThinkingVerb((prev) => pickRandomVerb(prev));
            }, ROTATE_INTERVAL_MS);
        }, IDLE_THRESHOLD_MS);
        return () => {
            clearTimeout(startTimeout);
            if (rotateInterval) clearInterval(rotateInterval);
        };
    }, [currentActivity]);

    const ActiveIcon = currentActivity ? iconFor(currentActivity) : IconBolt;
    const label =
        thinkingVerb ??
        stripTrailingEllipsis(currentActivity ?? FALLBACK_LABEL);
    return (
        <Box className={classes.badge} role="status" aria-live="polite">
            <Box className={classes.iconSlot} aria-hidden>
                <Box key={label} className={classes.iconInner}>
                    <ActiveIcon
                        size={12}
                        color="light-dark(var(--mantine-color-ldGray-6), var(--mantine-color-ldDark-7))"
                    />
                </Box>
                <Box className={classes.spinnerRing} />
            </Box>
            <Text fz="xs" c="dimmed">
                <span key={`text-${label}`} className={classes.activityText}>
                    {label}
                </span>
                {/* Visually-hidden ellipsis so screen readers say
                    "Looking for stale charts…" instead of "dot dot dot". */}
                <span className={classes.srOnlyEllipsis}>…</span>
                <AnimatedDots />
            </Text>
        </Box>
    );
};
