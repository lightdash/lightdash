import { type DashboardAiSummaryTile as AiSummaryTile } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    List,
    Loader,
    Menu,
    Stack,
    Text,
    Tooltip,
    VisuallyHidden,
} from '@mantine/core';
import { IconChartBar, IconClock, IconRefresh } from '@tabler/icons-react';
import { clsx } from 'clsx';
import {
    useEffect,
    useRef,
    useState,
    type ComponentProps,
    type FC,
} from 'react';
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
    <Text fz="sm" c="dimmed">
        {children}
    </Text>
);

const SKELETON_LINE_WIDTHS = ['45%', '100%', '96%', '100%', '88%', '62%'];

const SummarySkeleton: FC<{ label: string }> = ({ label }) => (
    <Stack gap="xs" role="status">
        <VisuallyHidden>{label}</VisuallyHidden>
        {SKELETON_LINE_WIDTHS.map((width, index) => (
            <Box
                key={index}
                className={styles.skeletonLine}
                w={width}
                mb={index === 0 ? 'xs' : 0}
            />
        ))}
    </Stack>
);

const SourceCharts: FC<{ charts: AiSummaryChart[] }> = ({ charts }) => {
    const [opened, setOpened] = useState(false);
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
        <Menu
            position="top-start"
            opened={opened}
            onChange={setOpened}
            onClose={clearHighlight}
        >
            <Menu.Target>
                <Tooltip
                    label={`Written from ${chartCountLabel(charts.length)}`}
                    disabled={opened}
                >
                    <Button
                        variant="subtle"
                        color="gray"
                        size="compact-xs"
                        leftSection={<MantineIcon icon={IconChartBar} />}
                        onMouseEnter={() => highlight(allTileUuids)}
                        onMouseLeave={clearHighlight}
                    >
                        {charts.length}
                    </Button>
                </Tooltip>
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
            <Group gap={4} wrap="nowrap">
                <SourceCharts charts={charts} />
                <Tooltip
                    label={isUpdating ? 'Updating' : `Updated ${generatedAgo}`}
                >
                    <Box className={styles.footerStatus}>
                        {isUpdating ? (
                            <Loader size={14} />
                        ) : (
                            <MantineIcon icon={IconClock} color="ldGray.6" />
                        )}
                    </Box>
                </Tooltip>
            </Group>
            <Tooltip label="Regenerate">
                <ActionIcon
                    color="gray"
                    size="sm"
                    aria-label="Regenerate"
                    disabled={!canRegenerate || isUpdating}
                    onClick={onRegenerate}
                >
                    <MantineIcon icon={IconRefresh} />
                </ActionIcon>
            </Tooltip>
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
                    {charts.length === 0
                        ? 'No charts to summarise yet. Add charts to this tab or pick different ones.'
                        : `Written from ${chartCountLabel(charts.length)} when the dashboard is viewed.`}
                </Text>
            </Stack>
        );
    }
    if (availability.status === 'loading') {
        return <SummarySkeleton label="Loading summary" />;
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
                <Stack
                    gap="xs"
                    className={clsx(
                        styles.content,
                        isUpdating && styles.updating,
                    )}
                >
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
                isWaitingForCharts
                    ? 'Waiting for charts to load'
                    : 'Writing summary'
            }
        />
    );
};

const DashboardAiSummaryTile: FC<Props> = (props) => (
    <TileBase title={props.tile.properties.title} {...props}>
        <Box className={clsx('non-draggable', styles.body)}>
            <SummaryBody tile={props.tile} isEditMode={props.isEditMode} />
        </Box>
    </TileBase>
);

export default DashboardAiSummaryTile;
