import {
    assertUnreachable,
    interpolateUiString,
    type UiStringKey,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Paper,
    Progress,
    Stack,
    Text,
    ThemeIcon,
    UnstyledButton,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconAppWindow,
    IconCircleCheckFilled,
    IconCircleMinus,
    IconEye,
} from '@tabler/icons-react';
import clsx from 'clsx';
import { useEffect, useRef, useState, type FC, type ReactNode } from 'react';
import { AiMarkdown } from '../../../../../../components/common/AiMarkdown';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import AppVersionNarration from '../../../../../../features/apps/components/AppVersionNarration';
import { useElapsedClock } from '../../../../../../features/apps/hooks/useElapsedClock';
import { formatBuildDuration } from '../../../../../../features/apps/utils/formatBuildDuration';
import { type AppVersionNarrationData } from '../../../../../../features/apps/utils/versionNarration';
import { useUiStrings } from '../../../../../providers/Embed/useUiStrings';
import styles from './DataAppBuildCard.module.css';
import {
    DATA_APP_BUILD_CANCELLED_TITLE,
    DATA_APP_BUILD_FAILED_TITLE,
    DATA_APP_BUILD_STEP_COUNT,
} from './dataAppBuildCardState';

export type DataAppBuildStep = { index: number; labelKey: UiStringKey };

export type DataAppBuildCardState =
    // name: null until the app row (or the tool result) names it.
    | { kind: 'queued'; name: string | null }
    | {
          kind: 'building';
          name: string | null;
          statusMessage: string;
          narration: AppVersionNarrationData;
          step: DataAppBuildStep;
          startedAt: Date;
      }
    | {
          kind: 'ready';
          name: string;
          version: number;
          durationMs: number | null;
          /** The theme this version was built with, from its snapshot. */
          themeName: string | null;
          /** Set when this version was restored from an earlier one. */
          restoredFromVersion: number | null;
          completionMessage: string;
      }
    | { kind: 'failed'; message: string }
    | { kind: 'cancelled' }
    | { kind: 'unavailable' };

type Props = {
    state: DataAppBuildCardState;
    /** Earlier turns: ready and failed collapse to a single row. */
    compact: boolean;
    /** This app is the one open in the preview panel. */
    isActive: boolean;
    onView: () => void;
};

const readySubtitle = (
    state: Extract<DataAppBuildCardState, { kind: 'ready' }>,
) => {
    const parts = [`v${state.version}`];
    if (state.restoredFromVersion !== null) {
        parts.push(`restored from v${state.restoredFromVersion}`);
    } else if (state.durationMs !== null) {
        parts.push(`built in ${formatBuildDuration(state.durationMs)}`);
    }
    if (state.themeName !== null) {
        parts.push(`${state.themeName} theme`);
    }
    return parts.join(' · ');
};

/** View opens the preview panel; it is the card's only action. */
const ViewButton: FC<{ onView: () => void }> = ({ onView }) => (
    <Button
        variant="default"
        size="compact-xs"
        leftSection={<MantineIcon icon={IconEye} size={14} />}
        onClick={onView}
    >
        View
    </Button>
);

const CardIcon: FC<{ tone: 'default' | 'error' | 'muted' }> = ({ tone }) => (
    <ThemeIcon
        size="sm"
        variant={tone === 'error' ? 'light' : 'default'}
        color={tone === 'error' ? 'red' : undefined}
        c={tone === 'muted' ? 'ldGray.5' : undefined}
    >
        <MantineIcon
            icon={tone === 'error' ? IconAlertTriangle : IconAppWindow}
            size={14}
        />
    </ThemeIcon>
);

/** Icon + title (+ subtitle) cell; sits left of the actions on wide cards. */
const Lead: FC<{ icon: ReactNode; children: ReactNode }> = ({
    icon,
    children,
}) => (
    <Box className={styles.lead}>
        {icon}
        <Stack gap={0} className={styles.leadText}>
            {children}
        </Stack>
    </Box>
);

const Actions: FC<{ children: ReactNode }> = ({ children }) => (
    <Box className={styles.actions}>{children}</Box>
);

/** Full-width cell indented to the title's left edge. */
const Body: FC<{ children: ReactNode }> = ({ children }) => (
    <Box className={styles.body}>{children}</Box>
);

const Title: FC<{ children: ReactNode }> = ({ children }) => (
    <Text size="sm" fw={500} truncate>
        {children}
    </Text>
);

/** Completed-build status: a green check, "Ready", then version details. */
const ReadyStatus: FC<{ detail: string }> = ({ detail }) => {
    const getUiString = useUiStrings();
    return (
        <Group gap={4} wrap="nowrap" className={styles.readyStatus}>
            <MantineIcon
                icon={IconCircleCheckFilled}
                size={14}
                color="green.6"
                className={styles.readyIcon}
            />
            <Text size="xs" truncate>
                <Text span fw={500} inherit>
                    {getUiString('aiAgent.dataAppBuild.ready')}
                </Text>
                <Text span c="dimmed" inherit>
                    {' · '}
                </Text>
                <Text span c="dimmed" inherit>
                    {detail}
                </Text>
            </Text>
        </Group>
    );
};

const Muted: FC<{ children: ReactNode }> = ({ children }) => (
    <Text size="xs" c="dimmed">
        {children}
    </Text>
);

/**
 * The agent's closing summary, as markdown. Long summaries would otherwise
 * push the chat's next turn off screen, so they clamp to a few lines until
 * the reader asks for the rest.
 */
const Summary: FC<{ children: string }> = ({ children }) => {
    const getUiString = useUiStrings();
    const clampRef = useRef<HTMLDivElement>(null);
    const [expanded, setExpanded] = useState(false);
    const [canExpand, setCanExpand] = useState(false);

    // Only measured while clamped: expanding removes the overflow, and the
    // flag has to survive that so "See less" stays available.
    useEffect(() => {
        const clamp = clampRef.current;
        if (!clamp || expanded) return;
        const measure = () =>
            setCanExpand(clamp.scrollHeight > clamp.clientHeight + 1);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(clamp);
        return () => observer.disconnect();
    }, [expanded, children]);

    return (
        <Stack gap={2} align="flex-start">
            {/* Labelled so the builder's own caveats don't read as the status. */}
            <Text component="span" className={styles.summaryLabel}>
                {getUiString('aiAgent.dataAppBuild.builderNotes')}
            </Text>
            <Box
                ref={clampRef}
                className={clsx(styles.summary, {
                    [styles.summaryClamped]: !expanded,
                })}
            >
                <AiMarkdown>{children}</AiMarkdown>
            </Box>
            {canExpand && (
                <UnstyledButton
                    className={styles.summaryToggle}
                    onClick={() => setExpanded((open) => !open)}
                >
                    {expanded ? 'See less' : 'See more'}
                </UnstyledButton>
            )}
        </Stack>
    );
};

/** Stage bar with "Step 2 of 4 · Writing the app" and a ticking clock. */
export const BuildProgress: FC<{ step: DataAppBuildStep; startedAt: Date }> = ({
    step,
    startedAt,
}) => {
    const elapsed = useElapsedClock(startedAt);
    const getUiString = useUiStrings();
    const position = {
        step: String(step.index + 1),
        total: String(DATA_APP_BUILD_STEP_COUNT),
    };
    return (
        <Stack gap={6}>
            <Progress
                size="sm"
                color="indigo"
                value={((step.index + 1) / DATA_APP_BUILD_STEP_COUNT) * 100}
                animated
                aria-label={interpolateUiString(
                    getUiString('aiAgent.dataAppBuild.progressLabel'),
                    position,
                )}
            />
            <Group gap="xs" justify="space-between" wrap="nowrap">
                <Text size="xs" c="dimmed" truncate>
                    {interpolateUiString(
                        getUiString('aiAgent.dataAppBuild.progress'),
                        { ...position, stage: getUiString(step.labelKey) },
                    )}
                </Text>
                {elapsed && (
                    <Text size="xs" c="dimmed" className={styles.elapsed}>
                        {elapsed}
                    </Text>
                )}
            </Group>
        </Stack>
    );
};

/** One-line "title · detail" header used by rows that must stay single-line. */
const InlineTitle: FC<{ title: string; detail: string }> = ({
    title,
    detail,
}) => (
    <Text size="sm" truncate>
        <Text span fw={500} inherit>
            {title}
        </Text>
        <Text span c="dimmed" inherit>
            {' · '}
        </Text>
        <Text span c="dimmed" inherit>
            {detail}
        </Text>
    </Text>
);

const renderCells = (
    state: DataAppBuildCardState,
    compact: boolean,
    onView: () => void,
): ReactNode => {
    switch (state.kind) {
        case 'queued':
            return (
                <>
                    <Lead icon={<CardIcon tone="default" />}>
                        <Title>{state.name ?? 'Building data app'}</Title>
                    </Lead>
                    <Body>
                        <Muted>
                            Starting the build. This can take a few minutes.
                        </Muted>
                    </Body>
                </>
            );
        case 'building':
            return (
                <>
                    <Box className={styles.full}>
                        <Lead icon={<CardIcon tone="default" />}>
                            <InlineTitle
                                title={state.name ?? 'Building data app'}
                                detail={state.statusMessage}
                            />
                        </Lead>
                    </Box>
                    <Box className={styles.full}>
                        <BuildProgress
                            step={state.step}
                            startedAt={state.startedAt}
                        />
                    </Box>
                    <Box className={styles.full}>
                        <AppVersionNarration
                            narration={state.narration}
                            isLive
                        />
                    </Box>
                    <Box className={styles.full}>
                        <Muted>
                            Builds in the background, so it's safe to close the
                            tab.
                        </Muted>
                    </Box>
                </>
            );
        case 'ready':
            if (compact) {
                return (
                    <>
                        <Lead icon={<CardIcon tone="default" />}>
                            <InlineTitle
                                title={state.name}
                                detail={readySubtitle(state)}
                            />
                        </Lead>
                        <Actions>
                            <ViewButton onView={onView} />
                        </Actions>
                    </>
                );
            }
            return (
                <>
                    <Lead icon={<CardIcon tone="default" />}>
                        <Title>{state.name}</Title>
                        <ReadyStatus detail={readySubtitle(state)} />
                    </Lead>
                    <Actions>
                        <ViewButton onView={onView} />
                    </Actions>
                    <Body>
                        <Summary>{state.completionMessage}</Summary>
                    </Body>
                </>
            );
        case 'failed':
            if (compact) {
                return (
                    <>
                        <Lead icon={<CardIcon tone="error" />}>
                            <Text size="xs" c="dimmed" lineClamp={2}>
                                {`${DATA_APP_BUILD_FAILED_TITLE}. ${state.message}`}
                            </Text>
                        </Lead>
                    </>
                );
            }
            return (
                <>
                    <Lead icon={<CardIcon tone="error" />}>
                        <Title>{DATA_APP_BUILD_FAILED_TITLE}</Title>
                    </Lead>
                    <Body>
                        <Muted>{state.message}</Muted>
                    </Body>
                </>
            );
        case 'cancelled':
            return (
                <>
                    <Lead
                        icon={
                            <ThemeIcon size="sm" variant="default">
                                <MantineIcon icon={IconCircleMinus} size={14} />
                            </ThemeIcon>
                        }
                    >
                        <Title>{DATA_APP_BUILD_CANCELLED_TITLE}</Title>
                    </Lead>
                </>
            );
        case 'unavailable':
            return (
                <Lead icon={<CardIcon tone="muted" />}>
                    <Muted>This app is no longer available.</Muted>
                </Lead>
            );
        default:
            return assertUnreachable(state, 'Unknown build card state');
    }
};

/**
 * Presentational build card shown under the agent's reply. Pure function of
 * `state`; navigation and data live in the caller.
 */
export const DataAppBuildCard: FC<Props> = ({
    state,
    compact,
    isActive,
    onView,
}) => (
    <Paper
        p="sm"
        radius="md"
        className={clsx(styles.card, {
            [styles.cardUnavailable]: state.kind === 'unavailable',
            [styles.cardActive]: isActive,
        })}
    >
        <Box className={styles.layout}>
            {renderCells(state, compact, onView)}
        </Box>
    </Paper>
);
