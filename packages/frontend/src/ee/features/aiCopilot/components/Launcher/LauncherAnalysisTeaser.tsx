import {
    type DataAppAnalysis,
    type DataAppAnomaly,
    type DataAppAnomalySeverity,
} from '@lightdash/common';
import { Box, Button, Group, Stack, Text } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useTimeAgo } from '../../../../../hooks/useTimeAgo';
import { openAnalysisPanel } from '../../store/aiAgentLauncherSlice';
import { useAiAgentStoreDispatch } from '../../store/hooks';
import {
    useLauncherAnalysisAdapter,
    type LauncherAnalysisAdapter,
} from './launcherAnalysisAdapter';
import panelStyles from './LauncherAnalysisPanel.module.css';
import styles from './LauncherAnalysisTeaser.module.css';

const SEVERITY_CLASS: Record<DataAppAnomalySeverity, string> = {
    high: panelStyles.severityHigh,
    medium: panelStyles.severityMedium,
    positive: panelStyles.severityPositive,
    info: panelStyles.severityInfo,
};

const TEASER_ANOMALY_COUNT = 2;

const AnomalyLine: FC<{ anomaly: DataAppAnomaly }> = ({ anomaly }) => (
    <Group gap="xs" wrap="nowrap">
        <Box
            className={`${panelStyles.severityDot} ${
                SEVERITY_CLASS[anomaly.severity]
            }`}
        />
        <Text size="xs" lineClamp={1} flex={1}>
            {anomaly.text}
        </Text>
    </Group>
);

const StoredAnalysisCard: FC<{
    analysis: DataAppAnalysis;
    stale: boolean;
    canRerun: boolean;
    onOpen: () => void;
    onRerun: () => void;
}> = ({ analysis, stale, canRerun, onOpen, onRerun }) => {
    const timeAgo = useTimeAgo(analysis.generatedAt);
    const anomalies = analysis.anomalies.slice(0, TEASER_ANOMALY_COUNT);
    const remaining = analysis.anomalies.length - anomalies.length;
    return (
        <Box className={styles.card} w="100%" mt="md">
            <Stack gap="xs">
                <Group gap="xs" wrap="nowrap" justify="space-between">
                    <Group gap="xxs" wrap="nowrap">
                        <MantineIcon
                            icon={IconSparkles}
                            color="indigo"
                            size={14}
                        />
                        <Text size="xs" fw={600}>
                            Insights on this view
                        </Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                        {stale ? 'view changed' : timeAgo}
                    </Text>
                </Group>
                <Text size="sm" fw={500}>
                    {analysis.headline}
                </Text>
                {anomalies.length > 0 && (
                    <Stack gap="xxs">
                        {anomalies.map((anomaly) => (
                            <AnomalyLine key={anomaly.id} anomaly={anomaly} />
                        ))}
                        {remaining > 0 && (
                            <Text size="xs" c="dimmed">
                                +{remaining} more
                            </Text>
                        )}
                    </Stack>
                )}
                <Group gap="xs">
                    <Button
                        size="compact-xs"
                        variant="light"
                        color="indigo"
                        onClick={onOpen}
                    >
                        Open analysis
                    </Button>
                    <Button
                        size="compact-xs"
                        variant="subtle"
                        color="gray"
                        disabled={!canRerun}
                        onClick={onRerun}
                    >
                        Re-run
                    </Button>
                </Group>
            </Stack>
        </Box>
    );
};

/**
 * Initial-state analysis entry in the new-thread panel. The page-side free
 * lookup has already decided: a stored analysis shows as a compact card, a
 * miss as a quiet CTA. `detect` only ever runs from an explicit click.
 */
export const AnalysisTeaserContent: FC<{
    adapter: LauncherAnalysisAdapter;
}> = ({ adapter }) => {
    const dispatch = useAiAgentStoreDispatch();
    const { controller } = adapter;
    const { state } = controller;
    const openAnalysis = () => dispatch(openAnalysisPanel());
    const analyseAndOpen = () => {
        void controller.analyse();
        openAnalysis();
    };
    // Same eligibility as the full panel: analysing settling sources would
    // spend a run on a view that is already changing under it.
    const canAnalyse = controller.sources.length > 0 && !controller.inFlight;

    // No CTA that cannot work: gates failed, or the view errored out.
    if (adapter.availability.status !== 'available') return null;
    if (state.status === 'error') return null;

    if (state.status === 'ready') {
        return (
            <StoredAnalysisCard
                analysis={state.analysis}
                stale={state.stale}
                canRerun={canAnalyse}
                onOpen={openAnalysis}
                onRerun={analyseAndOpen}
            />
        );
    }

    // Queries still settling: the lookup has not decided hit vs miss yet.
    if (
        state.status === 'idle' &&
        (controller.inFlight || controller.sources.length === 0)
    ) {
        return null;
    }

    return (
        <Stack gap="xs" align="center" mt="md">
            <Button
                variant="default"
                leftSection={
                    <MantineIcon icon={IconSparkles} color="indigo" size={14} />
                }
                loading={state.status === 'analysing'}
                onClick={analyseAndOpen}
            >
                Analyse this view
            </Button>
            <Text size="xs" c="dimmed" ta="center" maw={280}>
                Find what is out of the ordinary across the charts you have open
            </Text>
        </Stack>
    );
};

export const LauncherAnalysisTeaser: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const adapter = useLauncherAnalysisAdapter(projectUuid);
    if (!adapter) return null;
    return <AnalysisTeaserContent adapter={adapter} />;
};
