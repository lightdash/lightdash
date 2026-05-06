import {
    assertUnreachable,
    FeatureFlags,
    ManagedAgentScheduleOption,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine-8/core';
import {
    IconArrowRight,
    IconBolt,
    IconChartBar,
    IconShieldCheck,
    IconTrendingUp,
} from '@tabler/icons-react';
import {
    type CSSProperties,
    type FC,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { useNavigate } from 'react-router';
import { BetaBadge } from '../../../components/common/BetaBadge';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useManagedAgentActions } from './hooks/useManagedAgentActions';
import { useManagedAgentSettings } from './hooks/useManagedAgentSettings';
import classes from './ManagedAgentHomeCard.module.css';
import { ManagedAgentSetupModal } from './ManagedAgentSetupModal';

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

const formatSchedule = (schedule: ManagedAgentScheduleOption) => {
    switch (schedule) {
        case ManagedAgentScheduleOption.EVERY_6_HOURS:
            return '6h';
        case ManagedAgentScheduleOption.EVERY_12_HOURS:
            return '12h';
        case ManagedAgentScheduleOption.DAILY:
            return '24h';
        case ManagedAgentScheduleOption.EVERY_2_DAYS:
            return '2d';
        case ManagedAgentScheduleOption.WEEKLY:
            return '7d';
        default:
            return assertUnreachable(schedule, 'Unknown schedule option');
    }
};

/** Generates a deterministic grid of subtle squares */
const PixelGrid: FC = () => {
    const cells = useMemo(() => {
        const grid: Array<{ x: number; y: number; opacity: number }> = [];
        const seed = [
            3, 7, 1, 9, 4, 6, 2, 8, 5, 0, 7, 3, 1, 8, 6, 2, 9, 4, 5, 0, 3, 8, 1,
            6, 7, 2, 9, 5, 0, 4, 8, 1, 6, 3, 7, 9, 2, 5, 0, 8, 4, 1, 6, 3, 7, 9,
            2, 5, 8, 0, 4, 1, 3, 6, 7, 9,
        ];
        for (let row = 0; row < 30; row++) {
            for (let col = 0; col < 28; col++) {
                const idx = row * 28 + col;
                const val = seed[idx % seed.length];
                if (val > 6) {
                    grid.push({
                        x: col * 9 + ((val * 3) % 4) - 2,
                        y: row * 9 + ((val * 7) % 4) - 2,
                        opacity: val > 8 ? 0.18 : 0.08,
                    });
                }
            }
        }
        return grid;
    }, []);

    return (
        <svg className={classes.pixelGrid} width="252" height="270">
            {cells.map((cell, i) => (
                <rect
                    key={i}
                    x={cell.x}
                    y={cell.y}
                    width="7"
                    height="7"
                    rx="1.5"
                    fill="currentColor"
                    style={
                        {
                            '--rect-opacity': cell.opacity,
                        } as CSSProperties
                    }
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
    const { data: aiAutopilotFlag } = useServerFeatureFlag(
        FeatureFlags.AiAutopilot,
    );
    const managedAgentEnabled = !!aiAutopilotFlag?.enabled;
    const { data: settings } = useManagedAgentSettings({
        enabled: managedAgentEnabled,
    });
    const { data: actions } = useManagedAgentActions({
        enabled: managedAgentEnabled,
    });

    const isEnabled = settings?.enabled ?? false;
    const actionCount = actions?.length ?? 0;
    const lastActionAt = actions?.[0]?.createdAt ?? null;
    const schedule = settings?.schedule ?? ManagedAgentScheduleOption.DAILY;

    // Feature carousel — must be before any early returns (hooks rule)
    const [featureIdx, setFeatureIdx] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => {
            setFeatureIdx((prev) => (prev + 1) % FEATURES.length);
        }, 2500);
        return () => clearInterval(interval);
    }, []);

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
        if (counts.soft_deleted) parts.push(`${counts.soft_deleted} deleted`);
        return parts.join(', ');
    }, [actions]);

    const [setupOpen, setSetupOpen] = useState(false);

    if (!managedAgentEnabled) return null;

    const handleClick = () => {
        if (isEnabled) {
            void navigate(`/projects/${projectUuid}/improve`);
        } else {
            setSetupOpen(true);
        }
    };

    if (isEnabled) {
        return (
            <UnstyledButton onClick={handleClick} className={classes.card}>
                <PixelGrid />
                <Stack gap="md">
                    <Group gap="md" align="center">
                        <Box className={classes.orbActive}>
                            <IconBolt size={18} />
                        </Box>
                        <Stack gap={4}>
                            <Group gap={8} align="center">
                                <Text fz="lg" fw={700}>
                                    Autopilot
                                </Text>
                                <BetaBadge />
                                <Box className={classes.activePill}>
                                    <Box className={classes.activeDotSmall} />
                                    Active &middot; {formatSchedule(schedule)}
                                </Box>
                            </Group>
                            <Text fz="sm" c="dimmed" fw={500}>
                                {actionCount > 0 ? (
                                    <>
                                        {actionCount} actions
                                        {actionSummary && ` - ${actionSummary}`}
                                    </>
                                ) : (
                                    'Monitoring your project'
                                )}
                                {lastActionAt &&
                                    ` · last action ${formatRelative(lastActionAt)}`}
                            </Text>
                        </Stack>
                    </Group>

                    <Box ml={52}>
                        <Button
                            variant="default"
                            size="sm"
                            rightSection={<IconArrowRight size={14} />}
                        >
                            View progress
                        </Button>
                    </Box>
                </Stack>
            </UnstyledButton>
        );
    }

    // Setup state
    const currentFeature = FEATURES[featureIdx];

    return (
        <>
            <UnstyledButton onClick={handleClick} className={classes.card}>
                <PixelGrid />
                <Stack gap="md">
                    <Group gap="md" align="center">
                        <Box className={classes.orb}>
                            <IconBolt size={18} />
                        </Box>
                        <Stack gap={4}>
                            <Group gap={8} align="center">
                                <Text fz="lg" fw={700}>
                                    Autopilot
                                </Text>
                                <BetaBadge />
                            </Group>
                            <Group
                                gap={6}
                                wrap="nowrap"
                                key={featureIdx}
                                className={classes.featureCarousel}
                            >
                                <currentFeature.icon
                                    size={15}
                                    color="var(--mantine-color-violet-4)"
                                />
                                <Text fz="sm" fw={500} c="dimmed">
                                    {currentFeature.label}
                                </Text>
                            </Group>
                        </Stack>
                    </Group>

                    <Box ml={52}>
                        <Button
                            variant="filled"
                            color="dark"
                            size="sm"
                            rightSection={<IconArrowRight size={14} />}
                        >
                            Get started
                        </Button>
                    </Box>
                </Stack>
            </UnstyledButton>
            <ManagedAgentSetupModal
                projectUuid={projectUuid}
                opened={setupOpen}
                onClose={() => setSetupOpen(false)}
                onEnabled={() => {
                    setSetupOpen(false);
                    void navigate(`/projects/${projectUuid}/improve`);
                }}
            />
        </>
    );
};
