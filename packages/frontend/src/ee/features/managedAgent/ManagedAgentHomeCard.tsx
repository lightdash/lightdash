import { Box, Group, Stack, Text, UnstyledButton } from '@mantine-8/core';
import {
    IconArrowRight,
    IconChartBar,
    IconShieldCheck,
    IconTrendingUp,
} from '@tabler/icons-react';
import { type FC, useMemo } from 'react';
import { useNavigate } from 'react-router';
import useHealth from '../../../hooks/health/useHealth';
import { useManagedAgentActions } from './hooks/useManagedAgentActions';
import { useManagedAgentSettings } from './hooks/useManagedAgentSettings';
import classes from './ManagedAgentHomeCard.module.css';

const FEATURES = [
    { icon: IconShieldCheck, label: 'Fixes broken charts' },
    { icon: IconTrendingUp, label: 'Flags stale content' },
    { icon: IconChartBar, label: 'Creates visualizations' },
];

const formatRelative = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
};

const formatSchedule = (cron: string) => {
    const match = cron.match(/^\*\/(\d+) /);
    if (match) return `${match[1]}m`;
    if (cron === '0 * * * *') return '1h';
    if (cron === '0 */6 * * *') return '6h';
    if (cron === '0 0 * * *') return '24h';
    return cron;
};

/** Generates a deterministic grid of subtle squares for the pattern */
const PixelGrid: FC = () => {
    // Deterministic "random" pattern using a simple hash
    const cells = useMemo(() => {
        const grid: Array<{ x: number; y: number; opacity: number }> = [];
        const seed = [
            3, 7, 1, 9, 4, 6, 2, 8, 5, 0, 7, 3, 1, 8, 6, 2, 9, 4, 5, 0, 3, 8, 1,
            6,
        ];
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 6; col++) {
                const idx = row * 6 + col;
                const val = seed[idx % seed.length];
                if (val > 4) {
                    grid.push({
                        x: col * 10,
                        y: row * 10,
                        opacity: val > 7 ? 0.12 : 0.06,
                    });
                }
            }
        }
        return grid;
    }, []);

    return (
        <svg
            className={classes.pixelGrid}
            width="60"
            height="40"
            viewBox="0 0 60 40"
        >
            {cells.map((cell, i) => (
                <rect
                    key={i}
                    x={cell.x}
                    y={cell.y}
                    width="8"
                    height="8"
                    rx="2"
                    fill="currentColor"
                    opacity={cell.opacity}
                />
            ))}
        </svg>
    );
};

// ts-unused-exports:disable-next-line
export const ManagedAgentHomeCard: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const navigate = useNavigate();
    const { data: health } = useHealth();
    const { data: settings } = useManagedAgentSettings();
    const { data: actions } = useManagedAgentActions();

    const isEnabled = settings?.enabled ?? false;
    const actionCount = actions?.length ?? 0;
    const lastActionAt = actions?.[0]?.createdAt ?? null;
    const schedule = settings?.scheduleCron ?? '*/30 * * * *';

    const actionSummary = useMemo(() => {
        if (!actions || actions.length === 0) return null;
        const counts: Record<string, number> = {};
        for (const a of actions) {
            counts[a.actionType] = (counts[a.actionType] || 0) + 1;
        }
        const parts: string[] = [];
        if (counts.fixed_broken) parts.push(`${counts.fixed_broken} fixed`);
        if (counts.created_content)
            parts.push(`${counts.created_content} created`);
        if (counts.flagged_stale) parts.push(`${counts.flagged_stale} flagged`);
        if (counts.soft_deleted) parts.push(`${counts.soft_deleted} cleaned`);
        return parts.join(', ');
    }, [actions]);

    if (!health?.managedAgent?.enabled) return null;

    const handleClick = () => {
        void navigate(`/projects/${projectUuid}/improve`);
    };

    if (isEnabled) {
        return (
            <UnstyledButton onClick={handleClick} className={classes.card}>
                <PixelGrid />
                <Group justify="space-between" align="center">
                    <Group gap="md" align="center">
                        <Box className={classes.orbActive} />
                        <Stack gap={2}>
                            <Group gap={8} align="center">
                                <Text fz="sm" fw={600}>
                                    Agent active
                                </Text>
                                <Box className={classes.scheduleBadge}>
                                    {formatSchedule(schedule)}
                                </Box>
                                {lastActionAt && (
                                    <Text fz={11} c="dimmed">
                                        Last run {formatRelative(lastActionAt)}
                                    </Text>
                                )}
                            </Group>
                            <Text fz="xs" c="dimmed">
                                {actionCount > 0
                                    ? `${actionCount} actions — ${actionSummary}`
                                    : 'Monitoring your project'}
                            </Text>
                        </Stack>
                    </Group>
                    <Group gap={4} c="dimmed" className={classes.viewLink}>
                        <Text fz="xs" fw={500}>
                            View
                        </Text>
                        <IconArrowRight size={14} />
                    </Group>
                </Group>
            </UnstyledButton>
        );
    }

    // Setup state
    return (
        <UnstyledButton onClick={handleClick} className={classes.card}>
            <PixelGrid />
            <Group justify="space-between" align="center">
                <Group gap="md" align="center">
                    <Box className={classes.orb} />
                    <Stack gap={2}>
                        <Text fz="sm" fw={600}>
                            Self-improving agent
                        </Text>
                        <Group gap="md">
                            {FEATURES.map((f) => (
                                <Group key={f.label} gap={4}>
                                    <f.icon
                                        size={12}
                                        color="var(--mantine-color-dimmed)"
                                    />
                                    <Text fz={11} c="dimmed">
                                        {f.label}
                                    </Text>
                                </Group>
                            ))}
                        </Group>
                    </Stack>
                </Group>
                <Group gap={4} c="dimmed" className={classes.viewLink}>
                    <Text fz="xs" fw={500}>
                        Enable
                    </Text>
                    <IconArrowRight size={14} />
                </Group>
            </Group>
        </UnstyledButton>
    );
};
