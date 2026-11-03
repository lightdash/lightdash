import {
    isAgentOnboardingRunTerminal,
    type AgentOnboardingRun,
} from '@lightdash/common';
import { Box, Group, Paper, Text, useMantineColorScheme } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { useMemo, type FC } from 'react';
import { Link } from 'react-router';
import { AI_NAME } from '../../../components/common/aiName';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    markdownSanitizeRehypePlugins,
    rehypeRemoveHeaderLinks,
} from '../../../utils/markdownUtils';
import classes from './AgentOnboardingRunPage.module.css';
import {
    AGENT_ONBOARDING_PROGRESS_STAGES,
    collectAgentOnboardingArtifacts,
    describeAgentOnboardingEvent,
    formatStageDuration,
    getAgentOnboardingProgressStageTimings,
    getStageStates,
    type AgentOnboardingProgressStage,
} from './utils';

const STAGE_LABELS: Record<AgentOnboardingProgressStage, string> = {
    explore: 'Read your warehouse',
    semantic_layer: 'Define metrics',
    dashboard: 'Draft a dashboard',
    ready: 'Check and hand off',
};

const RECENT_STEPS = 3;

export const RunJourney: FC<{ run: AgentOnboardingRun; now: number }> = ({
    run,
    now,
}) => {
    const isLive = !isAgentOnboardingRunTerminal(run.status);
    const timings = getAgentOnboardingProgressStageTimings(run, now);
    const states = getStageStates(run, timings);
    const recent = run.events
        .flatMap(({ message, createdAt }) => {
            const label = describeAgentOnboardingEvent(message);
            return label ? [{ label, createdAt }] : [];
        })
        .slice(-RECENT_STEPS)
        .reverse();

    return (
        <Paper className={classes.journey}>
            <Box component="ol" className={classes.track}>
                {AGENT_ONBOARDING_PROGRESS_STAGES.map(({ stage }, index) => {
                    const state = states[index];
                    const durationMs =
                        state === 'not_started'
                            ? null
                            : (timings[index]?.durationMs ?? null);
                    return (
                        <Box
                            component="li"
                            key={stage}
                            className={classes.trackStep}
                            data-state={state}
                            aria-current={
                                state === 'active' ? 'step' : undefined
                            }
                        >
                            <Box className={classes.trackBar} />
                            <Group
                                gap={6}
                                wrap="nowrap"
                                justify="space-between"
                            >
                                <Text fz="sm" fw={500} truncate>
                                    {STAGE_LABELS[stage]}
                                </Text>
                                {durationMs !== null && (
                                    <Text
                                        fz="xs"
                                        c="dimmed"
                                        className={classes.trackDuration}
                                    >
                                        {formatStageDuration(durationMs)}
                                    </Text>
                                )}
                            </Group>
                        </Box>
                    );
                })}
            </Box>
            {isLive && (
                <Box component="ol" className={classes.liveSteps}>
                    {recent.length === 0 ? (
                        <Box
                            component="li"
                            className={classes.liveStep}
                            data-current
                        >
                            <Box className={classes.livePulse} aria-hidden />
                            <Text fz="sm">
                                {run.status === 'queued'
                                    ? 'Waiting for a free worker'
                                    : 'Getting ready'}
                            </Text>
                        </Box>
                    ) : (
                        recent.map(({ label, createdAt }, index) => (
                            <Box
                                component="li"
                                key={`${createdAt}-${label}`}
                                className={classes.liveStep}
                                data-current={index === 0}
                            >
                                {index === 0 ? (
                                    <Box
                                        className={classes.livePulse}
                                        aria-hidden
                                    />
                                ) : (
                                    <MantineIcon
                                        icon={IconCheck}
                                        size={12}
                                        className={classes.liveCheck}
                                    />
                                )}
                                <Text fz="sm" truncate>
                                    {label}
                                </Text>
                            </Box>
                        ))
                    )}
                </Box>
            )}
        </Paper>
    );
};

const MAX_ITEMS = 8;

type OutcomeProps = {
    title: string;
    items: string[];
    waiting: string;
    hrefFor: ((item: string) => string) | null;
    isLive: boolean;
};

const Outcome: FC<OutcomeProps> = ({
    title,
    items,
    waiting,
    hrefFor,
    isLive,
}) => {
    const extra = items.length - MAX_ITEMS;
    return (
        <Paper className={classes.outcome} data-empty={items.length === 0}>
            <Text fz="xs" c="dimmed" fw={500}>
                {title}
            </Text>
            <Text className={classes.outcomeCount}>{items.length}</Text>
            {items.length === 0 ? (
                <Text fz="xs" c="dimmed">
                    {isLive ? waiting : 'None this time'}
                </Text>
            ) : (
                <Box className={classes.chips}>
                    {items.slice(0, MAX_ITEMS).map((item) =>
                        hrefFor ? (
                            <Box
                                component={Link}
                                key={item}
                                to={hrefFor(item)}
                                className={classes.chip}
                                data-link
                            >
                                {item}
                            </Box>
                        ) : (
                            <Box key={item} className={classes.chip}>
                                {item}
                            </Box>
                        ),
                    )}
                    {extra > 0 && (
                        <Text fz="xs" c="dimmed" className={classes.chipMore}>
                            +{extra} more
                        </Text>
                    )}
                </Box>
            )}
        </Paper>
    );
};

export const RunOutcomes: FC<{ run: AgentOnboardingRun }> = ({ run }) => {
    const { tables, models, charts } = useMemo(
        () => collectAgentOnboardingArtifacts(run.events),
        [run.events],
    );
    const isLive = !isAgentOnboardingRunTerminal(run.status);
    const isDone = run.status === 'completed';
    return (
        <Box className={classes.outcomes}>
            <Outcome
                title="Tables read"
                items={tables}
                waiting={`${AI_NAME} starts by reading your tables`}
                hrefFor={null}
                isLive={isLive}
            />
            <Outcome
                title="Models with metrics"
                items={models}
                waiting="Written once the tables are read"
                hrefFor={
                    isDone
                        ? (model) =>
                              `/projects/${run.projectUuid}/tables/${model}`
                        : null
                }
                isLive={isLive}
            />
            <Outcome
                title="Charts drafted"
                items={charts}
                waiting="Drafted once the metrics are live"
                hrefFor={null}
                isLive={isLive}
            />
        </Box>
    );
};

const isInAppHref = (href: string) => /^(https?:|mailto:|\/|#)/.test(href);

// The agent links its own report by relative path, which has no page here
const rehypeRewrite: React.ComponentProps<
    typeof MarkdownPreview
>['rehypeRewrite'] = (node, index, parent) => {
    rehypeRemoveHeaderLinks?.(node, index, parent);
    if (
        node.type === 'element' &&
        node.tagName === 'a' &&
        !isInAppHref(String(node.properties?.href ?? ''))
    ) {
        node.tagName = 'span';
        node.properties = {};
    }
};

export const RunNotes: FC<{ summary: string }> = ({ summary }) => {
    const { colorScheme } = useMantineColorScheme();
    return (
        <Paper className={classes.notes}>
            <Text fz="xs" c="dimmed" fw={500} mb="xs">
                Notes from {AI_NAME}
            </Text>
            <Box data-color-mode={colorScheme}>
                <MarkdownPreview
                    source={summary}
                    rehypePlugins={markdownSanitizeRehypePlugins}
                    rehypeRewrite={rehypeRewrite}
                    className={classes.notesMarkdown}
                />
            </Box>
        </Paper>
    );
};
