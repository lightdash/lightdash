import {
    type DashboardAiSummaryTile as AiSummaryTile,
    type DataAppDetection,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Group,
    List,
    Loader,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconRefresh, IconSparkles } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { type ComponentProps, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import TileBase from '../../components/DashboardTiles/TileBase/index';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import { useTimeAgo } from '../../hooks/useTimeAgo';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { UNAVAILABLE_COPY } from '../apps/analysis/useDataAppAnalysisAvailability';
import { DEFAULT_AI_SUMMARY_INSTRUCTIONS } from './aiSummaryDefaults';
import styles from './DashboardAiSummaryTile.module.css';
import { useAiSummary } from './useAiSummary';

type Props = Pick<
    ComponentProps<typeof TileBase>,
    'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
> & { tile: AiSummaryTile };

const chartCountLabel = (count: number) =>
    `${count} ${count === 1 ? 'chart' : 'charts'}`;

const Message: FC<{ children: string }> = ({ children }) => (
    <Text fz="sm" c="dimmed">
        {children}
    </Text>
);

const SummaryFooter: FC<{
    summary: DataAppDetection;
    isUpdating: boolean;
    canRegenerate: boolean;
    onRegenerate: () => void;
}> = ({ summary, isUpdating, canRegenerate, onRegenerate }) => {
    const generatedAgo = useTimeAgo(summary.generatedAt);
    return (
        <Group justify="space-between" wrap="nowrap" gap="xs">
            <Text fz="xs" c="dimmed" truncate>
                {isUpdating
                    ? 'Updating…'
                    : `${chartCountLabel(summary.sources.length)} · Updated ${generatedAgo}`}
            </Text>
            {isUpdating ? (
                <Loader size={14} />
            ) : (
                <Tooltip label="Regenerate">
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        aria-label="Regenerate"
                        disabled={!canRegenerate}
                        onClick={onRegenerate}
                    >
                        <MantineIcon icon={IconRefresh} />
                    </ActionIcon>
                </Tooltip>
            )}
        </Group>
    );
};

const SummaryBody: FC<{ tile: AiSummaryTile; isEditMode: boolean }> = ({
    tile,
    isEditMode,
}) => {
    const projectUuid = useProjectUuid();
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const {
        availability,
        chartCount,
        hasSources,
        isWaitingForCharts,
        summary,
        isUpdating,
        error,
        regenerate,
        canRegenerate,
    } = useAiSummary({
        tile,
        projectUuid,
        dashboardUuid,
        enabled: !isEditMode,
    });

    if (isEditMode) {
        return (
            <Stack gap="xs">
                <Text fz="xs" c="dimmed">
                    {tile.properties.instructions
                        ? 'Instructions'
                        : 'Default instructions'}
                </Text>
                <Text fz="sm" className={styles.instructions}>
                    {tile.properties.instructions ??
                        DEFAULT_AI_SUMMARY_INSTRUCTIONS}
                </Text>
                <Text fz="xs" c="dimmed">
                    {chartCount === 0
                        ? 'No charts to summarise yet. Add charts to this tab or pick different ones.'
                        : `Written from ${chartCountLabel(chartCount)} when the dashboard is viewed.`}
                </Text>
            </Stack>
        );
    }
    if (availability.status === 'loading') return <Loader size="sm" />;
    if (availability.status === 'unavailable') {
        return <Message>{UNAVAILABLE_COPY[availability.reason]}</Message>;
    }
    if (chartCount === 0) {
        return <Message>This summary has no charts to read.</Message>;
    }
    if (summary) {
        return (
            <Stack gap="sm" h="100%" justify="space-between">
                <Stack gap="xs" className={clsx(isUpdating && styles.updating)}>
                    <Text fw={600}>{summary.headline}</Text>
                    <Text fz="sm">{summary.summary}</Text>
                    {summary.anomalies.length > 0 && (
                        <List size="sm" spacing={4}>
                            {summary.anomalies.map((anomaly) => (
                                <List.Item key={anomaly.id}>
                                    {anomaly.text}
                                </List.Item>
                            ))}
                        </List>
                    )}
                    {error && (
                        <Text fz="xs" c="red">
                            {error.error.message}
                        </Text>
                    )}
                </Stack>
                <SummaryFooter
                    summary={summary}
                    isUpdating={isUpdating}
                    canRegenerate={canRegenerate}
                    onRegenerate={() => regenerate()}
                />
            </Stack>
        );
    }
    if (error) return <Message>{error.error.message}</Message>;
    if (!isWaitingForCharts && !hasSources) {
        return <Message>The charts in this summary have no results.</Message>;
    }
    return (
        <Group gap="xs">
            <Loader size="sm" />
            <Message>
                {isWaitingForCharts
                    ? 'Waiting for charts to load…'
                    : 'Writing summary…'}
            </Message>
        </Group>
    );
};

const DashboardAiSummaryTile: FC<Props> = (props) => (
    <TileBase
        title={props.tile.properties.title}
        titleLeftIcon={<MantineIcon icon={IconSparkles} color="violet.6" />}
        {...props}
    >
        <Box className={clsx('non-draggable', styles.body)}>
            <SummaryBody tile={props.tile} isEditMode={props.isEditMode} />
        </Box>
    </TileBase>
);

export default DashboardAiSummaryTile;
