import { type McpActivityItem, type McpActivityStats } from '@lightdash/common';
import {
    Badge,
    Box,
    Group,
    Paper,
    Skeleton,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { type FC, type PropsWithChildren, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import InlineErrorState from '../../../../../components/common/InlineErrorState';
import {
    formatToolCallTime,
    formatToolCallTimeFull,
} from './mcpActivityFormat';
import styles from './McpActivityOverview.module.css';

const percentFormat = new Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits: 0,
});
const countFormat = new Intl.NumberFormat(undefined);

type StatTone = 'neutral' | 'success' | 'error';

// Theme-aware colors: green-text/error flip with the color scheme
const STAT_TONE_COLOR: Record<StatTone, string> = {
    neutral: 'foreground',
    success: 'var(--mantine-color-green-text)',
    error: 'var(--mantine-color-error)',
};

const StatTile: FC<{
    label: string;
    value: string;
    tone: StatTone;
    dotted?: boolean;
}> = ({ label, value, tone, dotted = false }) => (
    <Paper
        className={dotted ? styles.dottedCard : styles.card}
        variant={dotted ? 'dotted' : undefined}
        p="sm"
    >
        <Text className={styles.statLabel}>{label}</Text>
        <Text
            className={styles.statValue}
            c={dotted ? 'dimmed' : STAT_TONE_COLOR[tone]}
        >
            {value}
        </Text>
    </Paper>
);

export const McpActivityStatTiles: FC<{
    stats: McpActivityStats | undefined;
    isError: boolean;
}> = ({ stats, isError }) => {
    const { t } = useTranslation('aiCopilotAdmin');
    if (!stats) {
        if (isError) {
            return (
                <>
                    <StatTile
                        label={t('mcp.overview.calls')}
                        value="—"
                        tone="neutral"
                        dotted
                    />
                    <StatTile
                        label={t('mcp.overview.success')}
                        value="—"
                        tone="neutral"
                        dotted
                    />
                    <StatTile
                        label={t('mcp.overview.errors')}
                        value="—"
                        tone="neutral"
                        dotted
                    />
                </>
            );
        }
        return (
            <>
                <Skeleton h={62} radius={12} />
                <Skeleton h={62} radius={12} />
                <Skeleton h={62} radius={12} />
            </>
        );
    }

    const successRate =
        stats.totalCalls > 0
            ? (stats.totalCalls - stats.errorCalls) / stats.totalCalls
            : null;

    return (
        <>
            <StatTile
                label={t('mcp.overview.calls')}
                value={countFormat.format(stats.totalCalls)}
                tone="neutral"
            />
            <StatTile
                label={t('mcp.overview.success')}
                value={
                    successRate === null
                        ? '—'
                        : percentFormat.format(successRate)
                }
                tone={successRate === null ? 'neutral' : 'success'}
            />
            <StatTile
                label={t('mcp.overview.errors')}
                value={countFormat.format(stats.errorCalls)}
                tone={stats.errorCalls > 0 ? 'error' : 'neutral'}
            />
        </>
    );
};

const OverviewCard: FC<
    PropsWithChildren<{ title: string; suffix?: ReactNode }>
> = ({ title, suffix, children }) => (
    <Paper className={styles.card} p="md">
        <Group justify="space-between" align="center" gap="xs" mb="sm">
            <Text fz="sm" fw={600}>
                {title}
            </Text>
            {suffix}
        </Group>
        {children}
    </Paper>
);

const TopToolsCard: FC<{ tools: McpActivityStats['topTools'] }> = ({
    tools,
}) => {
    const { t } = useTranslation('aiCopilotAdmin');
    const maxCount = Math.max(...tools.map((tool) => tool.count), 1);
    return (
        <OverviewCard title={t('mcp.overview.topTools')}>
            <Stack gap="sm">
                {tools.map((tool) => (
                    <Box key={tool.toolName}>
                        <Group
                            justify="space-between"
                            wrap="nowrap"
                            gap="xs"
                            mb={4}
                        >
                            <Text fz="xs" ff="monospace" c="ldGray.8" truncate>
                                {tool.toolName}
                            </Text>
                            <Text fz="xs" c="ldGray.7" className={styles.num}>
                                {countFormat.format(tool.count)}
                            </Text>
                        </Group>
                        <Box className={styles.barTrack}>
                            <Box
                                className={styles.barFill}
                                __vars={{
                                    '--tool-share': `${Math.round(
                                        (tool.count / maxCount) * 100,
                                    )}%`,
                                }}
                            />
                        </Box>
                    </Box>
                ))}
            </Stack>
        </OverviewCard>
    );
};

const AgentsCard: FC<{ agents: McpActivityStats['agents'] }> = ({ agents }) => {
    const { t } = useTranslation('aiCopilotAdmin');
    return (
        <OverviewCard title={t('mcp.overview.activeAgents')}>
            <Stack gap={6}>
                {agents.map(({ agent, count }) => (
                    <Group
                        key={agent?.uuid ?? 'no-agent'}
                        justify="space-between"
                        wrap="nowrap"
                        gap="xs"
                    >
                        <Group
                            gap={6}
                            wrap="nowrap"
                            className={styles.truncatingGroup}
                        >
                            <Box className={styles.agentDot} />
                            <Text
                                fz="sm"
                                c={agent ? 'ldGray.9' : 'ldGray.6'}
                                truncate
                            >
                                {agent?.name ?? t('mcp.overview.noAgent')}
                            </Text>
                        </Group>
                        <Text fz="xs" c="ldGray.7" className={styles.num}>
                            {t('mcp.overview.callCount', {
                                count,
                                formatted: countFormat.format(count),
                            })}
                        </Text>
                    </Group>
                ))}
            </Stack>
        </OverviewCard>
    );
};

const RecentErrorsCard: FC<{
    errorCalls: number;
    recentErrors: McpActivityItem[];
    onErrorSelect: (toolCall: McpActivityItem) => void;
}> = ({ errorCalls, recentErrors, onErrorSelect }) => {
    const { t } = useTranslation('aiCopilotAdmin');
    return (
        <Paper className={styles.card}>
            <Group
                justify="space-between"
                align="center"
                gap="xs"
                p="md"
                pb="sm"
            >
                <Text fz="sm" fw={600}>
                    {t('mcp.overview.recentErrors')}
                </Text>
                {errorCalls > 0 && (
                    <Badge color="red" size="sm">
                        {countFormat.format(errorCalls)}
                    </Badge>
                )}
            </Group>
            {recentErrors.length === 0 ? (
                <Group gap={6} px="md" pb="md">
                    <Box className={styles.okDot} />
                    <Text fz="xs" c="dimmed">
                        {t('mcp.overview.noErrors')}
                    </Text>
                </Group>
            ) : (
                <Box pb={6}>
                    {recentErrors.map((item) => (
                        <UnstyledButton
                            key={item.uuid}
                            className={styles.errorRow}
                            onClick={() => onErrorSelect(item)}
                        >
                            <Group
                                justify="space-between"
                                wrap="nowrap"
                                gap="xs"
                                mb={2}
                            >
                                <Group
                                    gap={6}
                                    wrap="nowrap"
                                    className={styles.truncatingGroup}
                                >
                                    <Box className={styles.errorDot} />
                                    <Text
                                        fz="xs"
                                        ff="monospace"
                                        c="ldGray.8"
                                        truncate
                                    >
                                        {item.toolName}
                                    </Text>
                                </Group>
                                <Tooltip
                                    label={formatToolCallTimeFull(
                                        item.createdAt,
                                    )}
                                >
                                    <Text
                                        fz="xs"
                                        c="ldGray.5"
                                        className={styles.noShrink}
                                    >
                                        {formatToolCallTime(item.createdAt)}
                                    </Text>
                                </Tooltip>
                            </Group>
                            <Text fz="xs" c="ldGray.7" lineClamp={2}>
                                {item.errorMessage ??
                                    t('mcp.overview.unknownError')}
                            </Text>
                        </UnstyledButton>
                    ))}
                </Box>
            )}
        </Paper>
    );
};

type McpActivityOverviewProps = {
    stats: McpActivityStats | undefined;
    isError: boolean;
    onRetry: () => void;
    hasActiveFilters: boolean;
    onErrorSelect: (toolCall: McpActivityItem) => void;
};

export const McpActivityOverview: FC<McpActivityOverviewProps> = ({
    stats,
    isError,
    onRetry,
    hasActiveFilters,
    onErrorSelect,
}) => {
    const { t } = useTranslation('aiCopilotAdmin');
    if (!stats) {
        return (
            <>
                <Box className={styles.tileRow}>
                    <McpActivityStatTiles stats={undefined} isError={isError} />
                </Box>
                {isError ? (
                    <InlineErrorState
                        className={styles.dottedCard}
                        message={t('mcp.overview.loadError')}
                        onRetry={onRetry}
                    />
                ) : (
                    <>
                        <Skeleton h={200} radius={12} />
                        <Skeleton h={140} radius={12} />
                        <Skeleton h={180} radius={12} />
                    </>
                )}
            </>
        );
    }

    return (
        <>
            <Box className={styles.tileRow}>
                <McpActivityStatTiles stats={stats} isError={false} />
            </Box>
            {stats.totalCalls === 0 ? (
                <Paper className={styles.card} p="md">
                    <Text fz="sm" c="dimmed">
                        {hasActiveFilters
                            ? t('mcp.overview.noMatches')
                            : t('mcp.overview.noCalls')}
                    </Text>
                </Paper>
            ) : (
                <>
                    <TopToolsCard tools={stats.topTools} />
                    <AgentsCard agents={stats.agents} />
                    <RecentErrorsCard
                        errorCalls={stats.errorCalls}
                        recentErrors={stats.recentErrors}
                        onErrorSelect={onErrorSelect}
                    />
                </>
            )}
        </>
    );
};
