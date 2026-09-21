import {
    type DataAppAnomaly,
    type DataAppAnomalySeverity,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Drawer,
    Group,
    Paper,
    ScrollArea,
    Select,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import { type FC } from 'react';
import Callout from '../../../components/common/Callout';
import EmptyStateLoader from '../../../components/common/EmptyStateLoader';
import InlineErrorState from '../../../components/common/InlineErrorState';
import MantineIcon from '../../../components/common/MantineIcon';
import { rehypeRemoveHeaderLinks } from '../../../utils/markdownUtils';
import classes from './DataAppAnalysisPanel.module.css';
import { type InvestigationState } from './useDataAppAnalysis';
import { type DataAppAnalysisAvailability } from './useDataAppAnalysisAvailability';
import { type DataAppAnalysisController } from './useDataAppAnalysisController';

const PANEL_WIDTH = 440;

const SEVERITY_COLOR: Record<DataAppAnomalySeverity, string> = {
    high: 'red',
    medium: 'yellow',
    positive: 'green',
    info: 'gray',
};

const SEVERITY_LABEL: Record<DataAppAnomalySeverity, string> = {
    high: 'High',
    medium: 'Medium',
    positive: 'Positive',
    info: 'Info',
};

const UNAVAILABLE_COPY: Record<
    Extract<DataAppAnalysisAvailability, { status: 'unavailable' }>['reason'],
    string
> = {
    not_rolled_out: 'AI analysis is not available for this organization yet.',
    copilot_off: 'AI is not enabled for this organization.',
    org_setting_off:
        'AI analysis in data apps is turned off for this organization. An admin can turn it on under Settings → Ask AI.',
};

const AnomalyCard: FC<{
    anomaly: DataAppAnomaly;
    investigation: InvestigationState;
    canInvestigate: boolean;
    canContinue: boolean;
    highlightable: boolean;
    onHover: (queryUuid: string | null) => void;
    onInvestigate: () => void;
    onContinue: () => void;
}> = ({
    anomaly,
    investigation,
    canInvestigate,
    canContinue,
    highlightable,
    onHover,
    onInvestigate,
    onContinue,
}) => (
    <Paper
        p="md"
        className={
            highlightable ? classes.anomalyHighlightable : classes.anomaly
        }
        onMouseEnter={() => highlightable && onHover(anomaly.queryUuid)}
        onMouseLeave={() => highlightable && onHover(null)}
    >
        <Stack gap="xs">
            <Group gap="xs" justify="space-between" wrap="nowrap">
                <Badge color={SEVERITY_COLOR[anomaly.severity]}>
                    {SEVERITY_LABEL[anomaly.severity]}
                </Badge>
                {investigation.status === 'idle' && (
                    <Tooltip
                        label="Pick an agent to investigate"
                        disabled={canInvestigate}
                    >
                        <Button
                            size="xs"
                            variant="default"
                            onClick={onInvestigate}
                            disabled={!canInvestigate}
                        >
                            Investigate
                        </Button>
                    </Tooltip>
                )}
            </Group>
            <Text fz="sm">{anomaly.text}</Text>
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
                    <MDEditor.Markdown
                        source={investigation.investigation.explanation}
                        className={classes.markdown}
                        rehypeRewrite={rehypeRemoveHeaderLinks}
                    />
                    {investigation.investigation.partial && (
                        <Text fz="xs" c="dimmed">
                            The query budget ran out; this is a partial answer.
                        </Text>
                    )}
                    {canContinue && (
                        <Group justify="flex-end">
                            <Button
                                size="xs"
                                variant="light"
                                color="indigo"
                                onClick={onContinue}
                            >
                                Continue in Ask AI
                            </Button>
                        </Group>
                    )}
                </Stack>
            )}
        </Stack>
    </Paper>
);

type Props = {
    opened: boolean;
    onClose: () => void;
    appUuid: string;
    availability: DataAppAnalysisAvailability;
    controller: DataAppAnalysisController;
    lineageAvailable: boolean;
    onHoverQuery: (queryUuid: string | null) => void;
};

const DataAppAnalysisPanel: FC<Props> = ({
    opened,
    onClose,
    availability,
    controller,
    lineageAvailable,
    onHoverQuery,
}) => {
    const {
        sources,
        inFlight,
        state,
        investigations,
        analyse,
        agents,
        agentsLoading,
        selectedAgentUuid,
        rememberedAgentMissing,
        selectAgent,
        investigateAnomaly,
        continueInAskAi,
        canContinueInAskAi,
    } = controller;

    const handleContinue = (anomalyId: string) => {
        continueInAskAi(anomalyId);
        onClose();
    };

    const canAnalyse = sources.length > 0 && !inFlight;

    return (
        <Drawer.Root
            opened={opened}
            onClose={onClose}
            position="right"
            size={PANEL_WIDTH}
            lockScroll={false}
            closeOnClickOutside={false}
            trapFocus={false}
            classNames={{ inner: classes.inner, content: classes.content }}
        >
            {/* No overlay: it would sit over the app's iframe and swallow scrolling. */}
            <Drawer.Content data-testid="data-app-analysis-panel">
                <Drawer.Header>
                    <Drawer.Title>
                        <Group gap="xs">
                            <MantineIcon icon={IconSparkles} color="indigo" />
                            <Title order={5}>AI analysis</Title>
                        </Group>
                    </Drawer.Title>
                    <Drawer.CloseButton />
                </Drawer.Header>
                <Drawer.Body className={classes.body}>
                    <ScrollArea className={classes.scroll}>
                        <Stack gap="md" p="md">
                            {availability.status === 'unavailable' && (
                                <Paper variant="dotted" p="md">
                                    <Text fz="sm" c="dimmed">
                                        {UNAVAILABLE_COPY[availability.reason]}
                                    </Text>
                                </Paper>
                            )}
                            {availability.status === 'available' && (
                                <>
                                    <Group
                                        gap="xs"
                                        align="flex-end"
                                        wrap="nowrap"
                                    >
                                        <Select
                                            size="xs"
                                            flex={1}
                                            label="Agent for investigations"
                                            placeholder={
                                                agents.length === 0
                                                    ? 'No agents available'
                                                    : 'Pick an agent'
                                            }
                                            data={agents.map((a) => ({
                                                value: a.uuid,
                                                label: a.name,
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
                                            disabled={
                                                agents.length === 0 ||
                                                agentsLoading
                                            }
                                        />
                                        <Button
                                            size="xs"
                                            variant={
                                                state.status === 'ready' &&
                                                !state.stale
                                                    ? 'default'
                                                    : 'filled'
                                            }
                                            onClick={analyse}
                                            disabled={!canAnalyse}
                                            loading={
                                                state.status === 'analysing'
                                            }
                                        >
                                            {state.status === 'idle'
                                                ? 'Analyse this view'
                                                : 'Re-analyse'}
                                        </Button>
                                    </Group>
                                    <Text fz="xs" c="dimmed">
                                        Based on the queries this app ran for
                                        the current filters
                                        {sources.length > 0
                                            ? ` (${sources.length})`
                                            : ''}
                                        ; hidden tabs may be included.
                                        {inFlight
                                            ? ' Waiting for queries to finish.'
                                            : ''}
                                    </Text>

                                    {state.status === 'analysing' && (
                                        <EmptyStateLoader title="Reading the data on this page…" />
                                    )}
                                    {state.status === 'error' && (
                                        <InlineErrorState
                                            message={state.message}
                                            onRetry={analyse}
                                        />
                                    )}
                                    {state.status === 'ready' && (
                                        <>
                                            {state.stale && (
                                                <Callout
                                                    variant="warning"
                                                    title="The view changed"
                                                >
                                                    This analysis covers an
                                                    earlier set of queries.
                                                    Re-analyse to refresh it.
                                                </Callout>
                                            )}
                                            <Stack gap="xs">
                                                <Title order={5}>
                                                    {state.analysis.headline}
                                                </Title>
                                                <Text fz="sm">
                                                    {state.analysis.summary}
                                                </Text>
                                            </Stack>
                                            {state.analysis.anomalies.length ===
                                            0 ? (
                                                <Paper variant="dotted" p="md">
                                                    <Text fz="sm" c="dimmed">
                                                        Nothing notable found in
                                                        the current view.
                                                    </Text>
                                                </Paper>
                                            ) : (
                                                <Stack gap="xs">
                                                    {state.analysis.anomalies.map(
                                                        (anomaly) => (
                                                            <AnomalyCard
                                                                key={anomaly.id}
                                                                anomaly={
                                                                    anomaly
                                                                }
                                                                investigation={
                                                                    investigations[
                                                                        anomaly
                                                                            .id
                                                                    ] ?? {
                                                                        status: 'idle',
                                                                    }
                                                                }
                                                                canInvestigate={
                                                                    selectedAgentUuid !==
                                                                        null &&
                                                                    !state.stale
                                                                }
                                                                highlightable={
                                                                    lineageAvailable
                                                                }
                                                                canContinue={
                                                                    canContinueInAskAi
                                                                }
                                                                onHover={
                                                                    onHoverQuery
                                                                }
                                                                onInvestigate={() =>
                                                                    investigateAnomaly(
                                                                        anomaly.id,
                                                                    )
                                                                }
                                                                onContinue={() =>
                                                                    handleContinue(
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
                                                                    key={
                                                                        limitation
                                                                    }
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
                                                AI-generated from the data on
                                                this page
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
                </Drawer.Body>
            </Drawer.Content>
        </Drawer.Root>
    );
};

export default DataAppAnalysisPanel;
