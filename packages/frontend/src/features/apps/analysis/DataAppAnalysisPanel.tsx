import {
    type DataAppAnomaly,
    type DataAppAnomalySeverity,
} from '@lightdash/common';
import {
    Anchor,
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
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import Callout from '../../../components/common/Callout';
import EmptyStateLoader from '../../../components/common/EmptyStateLoader';
import InlineErrorState from '../../../components/common/InlineErrorState';
import MantineIcon from '../../../components/common/MantineIcon';
import useApp from '../../../providers/App/useApp';
import { rehypeRemoveHeaderLinks } from '../../../utils/markdownUtils';
import classes from './DataAppAnalysisPanel.module.css';
import { type InvestigationState } from './useDataAppAnalysis';
import {
    UNAVAILABLE_COPY,
    UNAVAILABLE_SETTINGS_PATH,
    type DataAppAnalysisAvailability,
    type DataAppAnalysisUnavailableReason,
} from './useDataAppAnalysisAvailability';
import { type DataAppAnalysisController } from './useDataAppAnalysisController';

const PANEL_WIDTH = 440;

const SEVERITY_COLOR: Record<DataAppAnomalySeverity, string> = {
    high: 'red',
    medium: 'yellow',
    positive: 'green',
    info: 'gray',
};

const Unavailable: FC<{ reason: DataAppAnalysisUnavailableReason }> = ({
    reason,
}) => {
    const { t } = useTranslation('apps');
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
                            {t('analysis.turnOnInSettings')}
                        </Anchor>
                    ) : (
                        <Text fz="sm" c="dimmed">
                            {t('analysis.askAdmin')}
                        </Text>
                    ))}
            </Stack>
        </Paper>
    );
};

const AnomalyCard: FC<{
    anomaly: DataAppAnomaly;
    investigation: InvestigationState;
    /** False when the viewer has no agent at all: the button is not offered. */
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
    const { t } = useTranslation('apps');
    return (
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
                        {t(`analysis.severity.${anomaly.severity}`)}
                    </Badge>
                    {investigable && investigation.status === 'idle' && (
                        <Tooltip
                            label={t('analysis.pickAgentToInvestigate')}
                            disabled={canInvestigate}
                        >
                            <Button
                                size="xs"
                                variant="default"
                                onClick={onInvestigate}
                                disabled={!canInvestigate}
                            >
                                {t('analysis.investigate')}
                            </Button>
                        </Tooltip>
                    )}
                </Group>
                <Text fz="sm">{anomaly.text}</Text>
                {investigation.status === 'running' && (
                    <EmptyStateLoader
                        title={t('analysis.investigating')}
                        py="sm"
                    />
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
                                {t('analysis.partialAnswer')}
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
                                    {t('analysis.continueInAskAi')}
                                </Button>
                            </Group>
                        )}
                    </Stack>
                )}
            </Stack>
        </Paper>
    );
};

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
    const { t } = useTranslation('apps');
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
                            <Title order={5}>{t('analysis.title')}</Title>
                        </Group>
                    </Drawer.Title>
                    <Drawer.CloseButton />
                </Drawer.Header>
                <Drawer.Body className={classes.body}>
                    <ScrollArea className={classes.scroll}>
                        <Stack gap="md" p="md">
                            {availability.status === 'unavailable' && (
                                <Unavailable reason={availability.reason} />
                            )}
                            {availability.status === 'available' && (
                                <>
                                    <Group
                                        gap="xs"
                                        align="flex-end"
                                        wrap="nowrap"
                                    >
                                        {agentAccess === 'none' ? (
                                            <Text flex={1} fz="xs" c="dimmed">
                                                {t('analysis.noAgent')}
                                            </Text>
                                        ) : (
                                            <Select
                                                size="xs"
                                                flex={1}
                                                label={t('analysis.agentLabel')}
                                                placeholder={t(
                                                    'analysis.agentPlaceholder',
                                                )}
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
                                                        ? t(
                                                              'analysis.agentMissing',
                                                          )
                                                        : undefined
                                                }
                                                disabled={agentsLoading}
                                            />
                                        )}
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
                                                ? t('analysis.analyse')
                                                : t('analysis.reanalyse')}
                                        </Button>
                                    </Group>
                                    <Text fz="xs" c="dimmed">
                                        {sources.length > 0
                                            ? t('analysis.basedOnCount', {
                                                  count: sources.length,
                                              })
                                            : t('analysis.basedOn')}
                                        {inFlight
                                            ? ` ${t('analysis.waitingForQueries')}`
                                            : ''}
                                    </Text>

                                    {state.status === 'analysing' && (
                                        <EmptyStateLoader
                                            title={t('analysis.reading')}
                                        />
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
                                                    title={t(
                                                        'analysis.stale.title',
                                                    )}
                                                >
                                                    {t('analysis.stale.body')}
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
                                                        {t(
                                                            'analysis.nothingNotable',
                                                        )}
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
                                                                investigable={
                                                                    agentAccess !==
                                                                    'none'
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
                                                    title={t(
                                                        'analysis.limitations',
                                                    )}
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
                                                {t('analysis.footer')}
                                                {state.analysis.dataAsOf
                                                    ? ` · ${t('analysis.dataAsOf', { date: state.analysis.dataAsOf })}`
                                                    : ''}
                                                {` · ${t(
                                                    'analysis.generatedAt',
                                                    {
                                                        date: new Date(
                                                            state.analysis
                                                                .generatedAt,
                                                        ).toLocaleString(),
                                                    },
                                                )}`}
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
