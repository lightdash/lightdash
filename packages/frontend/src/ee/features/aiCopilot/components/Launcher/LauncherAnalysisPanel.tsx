import {
    type DataAppAnomaly,
    type DataAppAnomalySeverity,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Center,
    Group,
    Paper,
    ScrollArea,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconMinus,
    IconRefresh,
    IconSparkles,
    IconZoomIn,
} from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import { useState, type CSSProperties, type FC } from 'react';
import { Link } from 'react-router';
import Callout from '../../../../../components/common/Callout';
import EmptyStateLoader from '../../../../../components/common/EmptyStateLoader';
import InlineErrorState from '../../../../../components/common/InlineErrorState';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { type InvestigationState } from '../../../../../features/apps/analysis/useDataAppAnalysis';
import {
    UNAVAILABLE_COPY,
    UNAVAILABLE_SETTINGS_PATH,
    type DataAppAnalysisUnavailableReason,
} from '../../../../../features/apps/analysis/useDataAppAnalysisAvailability';
import useApp from '../../../../../providers/App/useApp';
import { rehypeRemoveHeaderLinks } from '../../../../../utils/markdownUtils';
import { closePanel } from '../../store/aiAgentLauncherSlice';
import { useAiAgentStoreDispatch } from '../../store/hooks';
import launcherStyles from './AiAgentsLauncher.module.css';
import { type LauncherAnalysisAdapter } from './launcherAnalysisAdapter';
import styles from './LauncherAnalysisPanel.module.css';
import { LauncherPanelFrame } from './LauncherPanelFrame';

const SEVERITY_CLASS: Record<DataAppAnomalySeverity, string> = {
    high: styles.severityHigh,
    medium: styles.severityMedium,
    positive: styles.severityPositive,
    info: styles.severityInfo,
};

const NO_AGENT_COPY =
    "You don't have access to an AI agent in this project, so notable data points are listed but can't be investigated.";

const Unavailable: FC<{ reason: DataAppAnalysisUnavailableReason }> = ({
    reason,
}) => {
    const { user } = useApp();
    const settingsPath = UNAVAILABLE_SETTINGS_PATH[reason];
    const canManage = user.data?.ability.can('manage', 'Organization') ?? false;
    return (
        <Paper variant="dotted" p="md">
            <Stack gap="xs">
                <Text fz="sm" c="dimmed">
                    {UNAVAILABLE_COPY[reason]}
                </Text>
                {settingsPath &&
                    (canManage ? (
                        <Anchor component={Link} to={settingsPath} fz="sm">
                            Turn it on in settings
                        </Anchor>
                    ) : (
                        <Text fz="sm" c="dimmed">
                            Ask an organization admin to turn it on.
                        </Text>
                    ))}
            </Stack>
        </Paper>
    );
};

const CompactAnomalyCard: FC<{
    anomaly: DataAppAnomaly;
    investigation: InvestigationState;
    investigable: boolean;
    canInvestigate: boolean;
    canContinue: boolean;
    highlightable: boolean;
    onHover: (queryUuid: string | null) => void;
    onInvestigate: () => void;
    onContinue: () => void;
}> = ({
    anomaly,
    investigation,
    investigable,
    canInvestigate,
    canContinue,
    highlightable,
    onHover,
    onInvestigate,
    onContinue,
}) => {
    const [expanded, setExpanded] = useState(false);
    return (
        <Box
            className={highlightable ? styles.cardHighlightable : styles.card}
            onMouseEnter={() => highlightable && onHover(anomaly.queryUuid)}
            onMouseLeave={() => highlightable && onHover(null)}
        >
            <Stack gap="xs">
                <Group gap="xs" wrap="nowrap" align="flex-start">
                    <Box
                        className={`${styles.severityDot} ${SEVERITY_CLASS[anomaly.severity]}`}
                    />
                    <Text fz="sm" flex={1}>
                        {anomaly.text}
                    </Text>
                    {investigable && investigation.status === 'idle' && (
                        <Tooltip
                            label={
                                canInvestigate
                                    ? 'Investigate'
                                    : 'Pick an agent to investigate'
                            }
                        >
                            <ActionIcon
                                size="sm"
                                variant="default"
                                className={styles.investigateButton}
                                onClick={onInvestigate}
                                disabled={!canInvestigate}
                                aria-label="Investigate"
                            >
                                <MantineIcon icon={IconZoomIn} size={14} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>
                {investigation.status === 'running' && (
                    <EmptyStateLoader title="Investigating…" py="sm" />
                )}
                {investigation.status === 'error' && (
                    <InlineErrorState
                        message={investigation.message}
                        onRetry={onInvestigate}
                    />
                )}
                {investigation.status === 'ready' && (
                    <Stack gap="xs">
                        <Box
                            className={
                                expanded
                                    ? styles.investigationMarkdown
                                    : `${styles.investigationMarkdown} ${styles.clampedMarkdown}`
                            }
                        >
                            <MDEditor.Markdown
                                source={investigation.investigation.explanation}
                                rehypeRewrite={rehypeRemoveHeaderLinks}
                            />
                        </Box>
                        {investigation.investigation.partial && (
                            <Text fz="xs" c="dimmed">
                                The query budget ran out; this is a partial
                                answer.
                            </Text>
                        )}
                        <Group justify="flex-end" gap="xs">
                            <Button
                                size="compact-xs"
                                variant="default"
                                onClick={() => setExpanded((value) => !value)}
                            >
                                {expanded ? 'Show less' : 'Read more'}
                            </Button>
                            {canContinue && (
                                <Button
                                    size="compact-xs"
                                    variant="light"
                                    color="indigo"
                                    onClick={onContinue}
                                >
                                    Continue in Ask AI
                                </Button>
                            )}
                        </Group>
                    </Stack>
                )}
            </Stack>
        </Box>
    );
};

type Props = {
    adapter: LauncherAnalysisAdapter;
    style?: CSSProperties;
};

export const LauncherAnalysisPanel: FC<Props> = ({ adapter, style }) => {
    const dispatch = useAiAgentStoreDispatch();
    const { availability, controller, targetName } = adapter;
    const {
        sources,
        inFlight,
        state,
        investigations,
        analyse,
        agents,
        agentsLoading,
        agentAccess,
        selectedAgentUuid,
        rememberedAgentMissing,
        selectAgent,
        investigateAnomaly,
        continueInAskAi,
        canContinueInAskAi,
    } = controller;

    const canAnalyse =
        availability.status === 'available' && sources.length > 0 && !inFlight;

    return (
        <LauncherPanelFrame style={style}>
            <div className={launcherStyles.panelHeader}>
                <Group
                    gap="xs"
                    wrap="nowrap"
                    className={launcherStyles.flexFillNoMin}
                >
                    <MantineIcon icon={IconSparkles} color="indigo" size={16} />
                    <Text size="sm" fw={600}>
                        Analysis
                    </Text>
                    {targetName && (
                        <Text
                            size="sm"
                            c="dimmed"
                            className={launcherStyles.panelHeaderTitle}
                        >
                            · {targetName}
                        </Text>
                    )}
                </Group>
                <Group gap="xs" wrap="nowrap">
                    <ActionIcon
                        size="sm"
                        onClick={() => void analyse()}
                        disabled={!canAnalyse}
                        loading={state.status === 'analysing'}
                        aria-label="Re-analyse"
                    >
                        <MantineIcon icon={IconRefresh} size={16} />
                    </ActionIcon>
                    <ActionIcon
                        size="sm"
                        onClick={() => dispatch(closePanel())}
                        aria-label="Close panel"
                    >
                        <MantineIcon icon={IconMinus} size={16} />
                    </ActionIcon>
                </Group>
            </div>
            <div className={launcherStyles.panelBody}>
                <ScrollArea className={styles.scroll}>
                    <Stack gap="sm" p="md">
                        {availability.status === 'unavailable' && (
                            <Unavailable reason={availability.reason} />
                        )}
                        {availability.status === 'available' && (
                            <>
                                <Text fz="xs" c="dimmed">
                                    Based on the queries this view ran for the
                                    current filters
                                    {sources.length > 0
                                        ? ` (${sources.length})`
                                        : ''}
                                    ; hidden tabs may be included.
                                    {inFlight
                                        ? ' Waiting for queries to finish.'
                                        : ''}
                                </Text>
                                {state.status === 'idle' && (
                                    <Center py="xl">
                                        <Stack gap="xs" align="center">
                                            <Button
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconSparkles}
                                                        size={14}
                                                    />
                                                }
                                                onClick={() => void analyse()}
                                                disabled={!canAnalyse}
                                            >
                                                Analyse this view
                                            </Button>
                                            <Text
                                                fz="xs"
                                                c="dimmed"
                                                ta="center"
                                                maw={260}
                                            >
                                                Find what is out of the ordinary
                                                across the charts you have open
                                            </Text>
                                        </Stack>
                                    </Center>
                                )}
                                {state.status === 'analysing' && (
                                    <EmptyStateLoader title="Reading the data on this page…" />
                                )}
                                {state.status === 'error' && (
                                    <InlineErrorState
                                        message={state.message}
                                        onRetry={() => void analyse()}
                                    />
                                )}
                                {state.status === 'ready' && (
                                    <>
                                        {state.stale && (
                                            <Callout
                                                variant="warning"
                                                title="The view changed"
                                            >
                                                This analysis covers an earlier
                                                set of queries. Re-analyse to
                                                refresh it.
                                            </Callout>
                                        )}
                                        <Stack gap="xxs">
                                            <Text fz="sm" fw={600}>
                                                {state.analysis.headline}
                                            </Text>
                                            <Text fz="sm" c="dimmed">
                                                {state.analysis.summary}
                                            </Text>
                                        </Stack>
                                        {agentAccess === 'none' && (
                                            <Text fz="xs" c="dimmed">
                                                {NO_AGENT_COPY}
                                            </Text>
                                        )}
                                        {state.analysis.anomalies.length ===
                                        0 ? (
                                            <Paper variant="dotted" p="md">
                                                <Text fz="sm" c="dimmed">
                                                    Nothing notable found in the
                                                    current view.
                                                </Text>
                                            </Paper>
                                        ) : (
                                            <Stack gap="xs">
                                                <Text
                                                    fz="xs"
                                                    fw={600}
                                                    c="dimmed"
                                                    tt="uppercase"
                                                >
                                                    Notable points ·{' '}
                                                    {
                                                        state.analysis.anomalies
                                                            .length
                                                    }
                                                </Text>
                                                {state.analysis.anomalies.map(
                                                    (anomaly) => (
                                                        <CompactAnomalyCard
                                                            key={anomaly.id}
                                                            anomaly={anomaly}
                                                            investigation={
                                                                investigations[
                                                                    anomaly.id
                                                                ] ?? {
                                                                    status: 'idle',
                                                                }
                                                            }
                                                            investigable={
                                                                agentAccess !==
                                                                'none'
                                                            }
                                                            canInvestigate={
                                                                selectedAgentUuid !==
                                                                    null &&
                                                                !state.stale
                                                            }
                                                            canContinue={
                                                                canContinueInAskAi
                                                            }
                                                            highlightable={
                                                                adapter.highlightAvailable
                                                            }
                                                            onHover={
                                                                adapter.onHoverQuery
                                                            }
                                                            onInvestigate={() =>
                                                                investigateAnomaly(
                                                                    anomaly.id,
                                                                )
                                                            }
                                                            onContinue={() =>
                                                                continueInAskAi(
                                                                    anomaly.id,
                                                                )
                                                            }
                                                        />
                                                    ),
                                                )}
                                            </Stack>
                                        )}
                                        {state.analysis.limitations.length >
                                            0 && (
                                            <Callout
                                                variant="info"
                                                title="Limitations"
                                            >
                                                <Stack gap={4}>
                                                    {state.analysis.limitations.map(
                                                        (limitation) => (
                                                            <Text
                                                                key={limitation}
                                                                fz="xs"
                                                            >
                                                                {limitation}
                                                            </Text>
                                                        ),
                                                    )}
                                                </Stack>
                                            </Callout>
                                        )}
                                        <Text fz="xs" c="dimmed">
                                            AI-generated from the data on this
                                            page
                                            {state.analysis.dataAsOf
                                                ? ` · Data as of ${state.analysis.dataAsOf}`
                                                : ''}
                                            {` · Generated ${new Date(
                                                state.analysis.generatedAt,
                                            ).toLocaleString()}`}
                                        </Text>
                                    </>
                                )}
                            </>
                        )}
                    </Stack>
                </ScrollArea>
                {availability.status === 'available' &&
                    agentAccess === 'available' && (
                        <Box className={styles.footer}>
                            <Select
                                size="xs"
                                label="Agent for investigations"
                                placeholder="Pick an agent"
                                data={agents.map((agent) => ({
                                    value: agent.uuid,
                                    label: agent.name,
                                }))}
                                value={selectedAgentUuid}
                                onChange={(value) =>
                                    value && selectAgent(value)
                                }
                                error={
                                    rememberedAgentMissing
                                        ? 'The agent you picked is no longer available'
                                        : undefined
                                }
                                disabled={agentsLoading}
                            />
                        </Box>
                    )}
            </div>
        </LauncherPanelFrame>
    );
};
