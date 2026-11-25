import { type DashboardAiSummaryTile as AiSummaryTile } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    List,
    Menu,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconChartBar, IconClock, IconRefresh } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useEffect, useRef, type ComponentProps, type FC } from 'react';
import {
    highlightDashboardTiles,
    scrollToDashboardTile,
} from '../../components/common/Dashboard/scrollToDashboardTile';
import MantineIcon from '../../components/common/MantineIcon';
import TileBase from '../../components/DashboardTiles/TileBase/index';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import { useTimeAgo } from '../../hooks/useTimeAgo';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { UNAVAILABLE_COPY } from '../apps/analysis/useDataAppAnalysisAvailability';
import { DEFAULT_AI_SUMMARY_INSTRUCTIONS } from './aiSummaryDefaults';
import { type AiSummaryChart } from './aiSummarySources';
import styles from './DashboardAiSummaryTile.module.css';
import { useAiSummary } from './useAiSummary';

type Props = Pick<
    ComponentProps<typeof TileBase>,
    'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
> & { tile: AiSummaryTile };

const chartCountLabel = (count: number) =>
    `${count} ${count === 1 ? 'chart' : 'charts'}`;

const Message: FC<{ children: string }> = ({ children }) => (
    <Text fz="sm" c="dimmed" className={styles.content}>
        {children}
    </Text>
);

// Word-sized shapes, so the placeholder reads as a paragraph being written
const SKELETON_WORD_WIDTHS = [
    52, 18, 34, 71, 26, 44, 60, 22, 38, 84, 30, 48, 20, 66, 40, 28, 56, 74, 24,
    46, 36, 62, 18, 50, 32, 78, 42, 26, 58, 34, 68, 22, 44, 54, 30, 72, 38, 20,
    64, 46, 28, 52, 36, 80, 24, 48, 60, 32, 42, 70, 26, 56, 34, 44, 62, 20, 50,
    38, 66, 28,
];

const SummarySkeleton: FC<{ label: string }> = ({ label }) => (
    <Stack gap="xs" className={styles.skeleton}>
        <Text fz="sm" role="status" className={styles.skeletonLabel}>
            {label}
        </Text>
        <Box className={styles.skeletonWords} aria-hidden>
            {SKELETON_WORD_WIDTHS.map((width, index) => (
                <Box
                    key={index}
                    className={styles.skeletonWord}
                    w={width}
                    __vars={{ '--word-index': `${index}` }}
                />
            ))}
        </Box>
    </Stack>
);

const SourceCharts: FC<{ charts: AiSummaryChart[]; disabled: boolean }> = ({
    charts,
    disabled,
}) => {
    const stopHighlight = useRef<(() => void) | null>(null);
    const clearHighlight = () => {
        stopHighlight.current?.();
        stopHighlight.current = null;
    };
    const highlight = (tileUuids: string[]) => {
        clearHighlight();
        stopHighlight.current = highlightDashboardTiles(tileUuids);
    };
    useEffect(() => clearHighlight, []);
    const allTileUuids = charts.map((chart) => chart.tileUuid);

    return (
        <Menu position="top-start" onClose={clearHighlight}>
            <Menu.Target>
                <Button
                    variant="subtle"
                    color="gray"
                    size="compact-xs"
                    className={styles.footerControl}
                    aria-label={`Written from ${chartCountLabel(charts.length)}`}
                    disabled={disabled}
                    leftSection={<MantineIcon icon={IconChartBar} size={14} />}
                    onMouseEnter={() => highlight(allTileUuids)}
                    onMouseLeave={clearHighlight}
                >
                    {charts.length}
                </Button>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Label>Charts in this summary</Menu.Label>
                {charts.map((chart) => (
                    <Menu.Item
                        key={chart.tileUuid}
                        leftSection={<MantineIcon icon={IconChartBar} />}
                        onMouseEnter={() => highlight([chart.tileUuid])}
                        onMouseLeave={clearHighlight}
                        onClick={() => scrollToDashboardTile(chart.tileUuid)}
                    >
                        {chart.label}
                    </Menu.Item>
                ))}
            </Menu.Dropdown>
        </Menu>
    );
};

const SummaryFooter: FC<{
    charts: AiSummaryChart[];
    generatedAt: Date;
    isUpdating: boolean;
    canRegenerate: boolean;
    onRegenerate: () => void;
}> = ({ charts, generatedAt, isUpdating, canRegenerate, onRegenerate }) => {
    const generatedAgo = useTimeAgo(generatedAt);
    return (
        <Group
            className={styles.footer}
            justify="space-between"
            wrap="nowrap"
            gap="xs"
        >
            <Group gap={2} wrap="nowrap">
                <SourceCharts charts={charts} disabled={isUpdating} />
                <Tooltip label={`Updated ${generatedAgo}`}>
                    <Box className={styles.footerStatus}>
                        <MantineIcon icon={IconClock} size={14} />
                    </Box>
                </Tooltip>
            </Group>
            <ActionIcon
                color="gray"
                size="xs"
                className={styles.footerControl}
                aria-label="Regenerate"
                disabled={!canRegenerate || isUpdating}
                onClick={onRegenerate}
            >
                <MantineIcon icon={IconRefresh} size={14} />
            </ActionIcon>
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
        charts,
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
            <Stack gap="xs" className={styles.content}>
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
                    {charts.length === 0
                        ? 'No charts to summarise yet. Add charts to this tab or pick different ones.'
                        : `Written from ${chartCountLabel(charts.length)} when the dashboard is viewed.`}
                </Text>
            </Stack>
        );
    }
    if (availability.status === 'loading') {
        return <SummarySkeleton label="Loading summary…" />;
    }
    if (availability.status === 'unavailable') {
        return <Message>{UNAVAILABLE_COPY[availability.reason]}</Message>;
    }
    if (charts.length === 0) {
        return <Message>This summary has no charts to read.</Message>;
    }
    if (summary) {
        return (
            <>
                {isUpdating ? (
                    <SummarySkeleton label="Updating summary…" />
                ) : (
                    <Box className={styles.content}>
                        <Stack gap="xs" className={styles.summaryText}>
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
                    </Box>
                )}
                <SummaryFooter
                    charts={charts}
                    generatedAt={summary.generatedAt}
                    isUpdating={isUpdating}
                    canRegenerate={canRegenerate}
                    onRegenerate={() => regenerate()}
                />
            </>
        );
    }
    if (error) return <Message>{error.error.message}</Message>;
    if (!isWaitingForCharts && !hasSources) {
        return <Message>The charts in this summary have no results.</Message>;
    }
    return (
        <SummarySkeleton
            label={
                isWaitingForCharts ? 'Waiting for charts…' : 'Writing summary…'
            }
        />
    );
};

const DashboardAiSummaryTile: FC<Props> = (props) => (
    <TileBase title={props.tile.properties.title} fullWidth {...props}>
        <Box className={clsx('non-draggable', styles.body)}>
            <SummaryBody tile={props.tile} isEditMode={props.isEditMode} />
        </Box>
    </TileBase>
);

export default DashboardAiSummaryTile;
