import {
    ActionIcon,
    Affix,
    Box,
    Button,
    Group,
    HoverCard,
    Paper,
    Skeleton,
    Text,
    Tooltip,
    getDefaultZIndex,
    useMantineTheme,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
    IconArrowBackUp,
    IconArrowDownLeft,
    IconBrandSlack,
    IconChartBar,
    IconChartRadar,
    IconChevronRight,
    IconCircleCheckFilled,
    IconDatabase,
    IconGitBranch,
    IconLayersLinked,
    IconListCheck,
    IconPalette,
    IconPlugConnected,
    IconUsers,
    IconX,
    type Icon,
} from '@tabler/icons-react';
import { useEffect, useRef, type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AI_NAME } from '../../../../../components/common/aiName';
import MantineIcon from '../../../../../components/common/MantineIcon';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import { HomepageTour } from '../../onboarding';
import { type RecommendedActionsState } from '../useRecommendedActions';
import { ChartTypeSuggestions } from './ChartTypeSuggestions';
import classes from './SetupGuide.module.css';
import {
    countProgress,
    isCompletedStatus,
    isSkippableRow,
    type SetupGuideChoice,
    type SetupGuideRow,
    type SetupGuideRowId,
    type SetupGuideSection,
} from './setupGuideModel';
import { ChoiceArt, StepArt } from './StepArt';
import { useCanAiAnswer } from './useCanAiAnswer';
import { useSetupGuide } from './useSetupGuide';
import { YourData } from './YourData';

const ROW_COPY: Record<
    SetupGuideRowId,
    { icon: Icon; pitch: string; time: string }
> = {
    warehouse: {
        icon: IconDatabase,
        pitch: 'Add your own tables so charts and answers can use them.',
        time: '3 min',
    },
    'app-data': {
        icon: IconPlugConnected,
        pitch: 'Query PostHog or GA4 next to your warehouse metrics.',
        time: '2 min',
    },
    'semantic-layer': {
        icon: IconLayersLinked,
        pitch: 'Define revenue once and reuse it in charts and answers.',
        time: '5 min',
    },
    'first-chart': {
        icon: IconChartBar,
        pitch: `Ask ${AI_NAME}, or pick a table and build it yourself.`,
        time: '2 min',
    },
    'chart-types': {
        icon: IconChartRadar,
        pitch: 'Heatmaps, radar charts and more, installed from the chart library.',
        time: '1 min',
    },
    'source-control': {
        icon: IconGitBranch,
        pitch: 'Keep your models in Git and review changes as pull requests.',
        time: '3 min',
    },
    brand: {
        icon: IconPalette,
        pitch: 'Use your colors and logo in charts and dashboards.',
        time: '1 min',
    },
    slack: {
        icon: IconBrandSlack,
        pitch: `Tag @${AI_NAME} in any channel and get answers in the thread.`,
        time: '1 min',
    },
    'invite-team': {
        icon: IconUsers,
        pitch: 'Give teammates access so they can ask their own questions.',
        time: '1 min',
    },
};

const isAskChoice = (choice: SetupGuideChoice) => choice.kind === 'ask';

const rowProperties = (row: SetupGuideRow, projectUuid: string) => ({
    surface: 'setup_guide' as const,
    projectId: projectUuid,
    rowId: row.id,
    actionKey: row.actionKey,
});

type RowHandlers = {
    // Ask rows fill the composer on this page instead of leaving it
    onAsk: () => void;
    onSkip: (row: SetupGuideRow) => void;
    onRestore: (row: SetupGuideRow) => void;
};

const RowDismiss: FC<{ row: SetupGuideRow } & RowHandlers> = ({
    row,
    onSkip,
    onRestore,
}) => {
    if (row.status === 'skipped') {
        return (
            <Tooltip label="Add back">
                <ActionIcon
                    size="sm"
                    aria-label={`Add back ${row.title}`}
                    onClick={() => onRestore(row)}
                >
                    <MantineIcon icon={IconArrowBackUp} />
                </ActionIcon>
            </Tooltip>
        );
    }
    if (row.status !== 'suggested' || !isSkippableRow(row)) return null;
    return (
        <Tooltip label="Skip for now">
            <ActionIcon
                size="sm"
                aria-label={`Skip ${row.title}`}
                onClick={() => onSkip(row)}
            >
                <MantineIcon icon={IconX} />
            </ActionIcon>
        </Tooltip>
    );
};

const RowStatus: FC<{ row: SetupGuideRow }> = ({ row }) => {
    if (isCompletedStatus(row.status)) {
        return (
            <MantineIcon
                icon={IconCircleCheckFilled}
                size={16}
                className={classes.check}
            />
        );
    }
    if (row.status === 'building') {
        return <Box className={classes.liveDot} aria-label="In progress" />;
    }
    if (row.status === 'skipped') {
        return (
            <Text fz="xs" c="dimmed">
                Skipped
            </Text>
        );
    }
    return null;
};

const GuideRow: FC<
    { row: SetupGuideRow; projectUuid: string } & RowHandlers
> = ({ row, projectUuid, ...handlers }) => {
    const { track } = useTracking();
    const theme = useMantineTheme();
    // The preview needs hover and room beside the dock; the row link still acts without it
    const canPreview = useMediaQuery(
        `(min-width: ${theme.breakpoints.md}) and (hover: hover)`,
    );
    const trackClick = (
        choice: SetupGuideChoice['kind'] | null,
        destination: string | null,
    ) =>
        track({
            name: EventName.HOMEPAGE_RECOMMENDED_ACTION_CLICKED,
            properties: {
                ...rowProperties(row, projectUuid),
                choice,
                destination,
            },
        });
    const copy = ROW_COPY[row.id];
    const content: ReactNode = (
        <>
            <Box className={classes.rowIcon}>
                <MantineIcon icon={copy.icon} size={14} />
            </Box>
            <Box className={classes.grow}>
                <Text fz="sm" lineClamp={2} className={classes.rowTitle}>
                    {row.title}
                </Text>
                {row.status === 'building' && row.evidence && (
                    <Text fz="xs" c="dimmed" truncate>
                        {row.evidence.text}
                    </Text>
                )}
            </Box>
            {row.choices.length > 0 ? (
                <MantineIcon icon={IconChevronRight} size={14} color="dimmed" />
            ) : (
                <RowStatus row={row} />
            )}
        </>
    );
    const { action } = row;
    return (
        <HoverCard
            disabled={!canPreview}
            position="right-start"
            offset={24}
            width={
                row.choices.length > 0 || row.preview?.kind === 'chart-types'
                    ? 360
                    : 280
            }
            openDelay={120}
            closeDelay={80}
        >
            <HoverCard.Target>
                <Box
                    component="li"
                    className={classes.row}
                    data-status={row.status}
                >
                    {action && row.status !== 'skipped' ? (
                        <Link
                            to={action.to}
                            className={classes.rowLink}
                            onClick={(event) => {
                                if (row.choices.some(isAskChoice)) {
                                    event.preventDefault();
                                    trackClick('ask', null);
                                    handlers.onAsk();
                                    return;
                                }
                                trackClick(null, action.to);
                            }}
                        >
                            {content}
                        </Link>
                    ) : (
                        <Box className={classes.rowLink}>{content}</Box>
                    )}
                    <Box className={classes.reveal}>
                        <RowDismiss row={row} {...handlers} />
                    </Box>
                </Box>
            </HoverCard.Target>
            <HoverCard.Dropdown p={0} className={classes.preview}>
                {row.choices.length > 0 ? (
                    <Box p="sm">
                        <Text fz="sm" fw={600}>
                            {row.title}
                        </Text>
                        <Text fz="xs" c="dimmed" mb="sm">
                            Save it to share with your team or add it to a
                            dashboard.
                        </Text>
                        <Box className={classes.choices}>
                            {row.choices.map((choice) => (
                                <Link
                                    key={choice.kind}
                                    to={choice.to}
                                    className={classes.choice}
                                    onClick={(event) => {
                                        if (!isAskChoice(choice)) {
                                            trackClick(choice.kind, choice.to);
                                            return;
                                        }
                                        event.preventDefault();
                                        trackClick(choice.kind, null);
                                        handlers.onAsk();
                                    }}
                                >
                                    <ChoiceArt kind={choice.kind} />
                                    <Text fz="xs" fw={600} px={10} py={8}>
                                        {choice.label}
                                    </Text>
                                </Link>
                            ))}
                        </Box>
                    </Box>
                ) : row.preview?.kind === 'chart-types' && action ? (
                    <ChartTypeSuggestions
                        projectUuid={projectUuid}
                        chartTypes={row.preview.chartTypes}
                        libraryUrl={action.to}
                    />
                ) : (
                    <>
                        <StepArt
                            id={row.id}
                            badge={
                                isCompletedStatus(row.status)
                                    ? 'Done'
                                    : copy.time
                            }
                            size="lg"
                        />
                        <Box p="sm">
                            <Text fz="sm" fw={600}>
                                {row.title}
                            </Text>
                            <Text fz="xs" c="dimmed">
                                {row.evidence?.text ?? copy.pitch}
                            </Text>
                        </Box>
                    </>
                )}
            </HoverCard.Dropdown>
        </HoverCard>
    );
};

type SetupGuideViewProps = {
    projectUuid: string;
    sections: SetupGuideSection[];
    isMinimized: boolean;
    onMinimizedChange: (isMinimized: boolean) => void;
} & RowHandlers;

/** The setup checklist, docked in the corner so the chat keeps the page */
export const SetupGuideView: FC<SetupGuideViewProps> = ({
    projectUuid,
    sections,
    isMinimized,
    onMinimizedChange,
    ...handlers
}) => {
    const { track } = useTracking();
    const rows = sections.flatMap((section) => section.rows);
    const { completed, total } = countProgress(rows);
    // Skipped rows are out of the total, so this means nothing is left to do
    const isHidden = completed === total;
    const hasTrackedImpression = useRef(false);
    useEffect(() => {
        if (isHidden || hasTrackedImpression.current) return;
        hasTrackedImpression.current = true;
        track({
            name: EventName.HOMEPAGE_RECOMMENDED_ACTION_IMPRESSION,
            properties: {
                surface: 'setup_guide',
                projectId: projectUuid,
                rowId: null,
                actionKey: null,
                choice: null,
                completedCount: completed,
                totalCount: total,
                isMinimized,
            },
        });
    }, [isHidden, track, projectUuid, completed, total, isMinimized]);
    if (isHidden) return null;
    // Done steps lead, then what is left, then skipped steps at the bottom
    const orderedRows = [
        ...rows.filter((row) => isCompletedStatus(row.status)),
        ...rows.filter(
            (row) => !isCompletedStatus(row.status) && row.status !== 'skipped',
        ),
        ...rows.filter((row) => row.status === 'skipped'),
    ];
    return (
        <Affix
            position={{ bottom: 16, left: 16 }}
            zIndex={getDefaultZIndex('app')}
        >
            {isMinimized ? (
                <Button
                    variant="default"
                    radius="xl"
                    data-tour="home-setup"
                    aria-label={`Getting started, ${completed} of ${total} done`}
                    leftSection={<MantineIcon icon={IconListCheck} />}
                    onClick={() => onMinimizedChange(false)}
                >
                    Getting started {completed}/{total}
                </Button>
            ) : (
                <Paper
                    className={classes.dock}
                    role="region"
                    aria-label="Getting started"
                    data-tour="home-setup"
                >
                    <Group
                        justify="space-between"
                        align="flex-start"
                        wrap="nowrap"
                        className={classes.dockHeader}
                    >
                        <Text fz="sm" fw={600}>
                            Getting started
                        </Text>
                        <Tooltip label="Minimize">
                            <ActionIcon
                                size="sm"
                                aria-label="Minimize getting started"
                                onClick={() => onMinimizedChange(true)}
                            >
                                <MantineIcon icon={IconArrowDownLeft} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                    <Box className={classes.segments} aria-hidden>
                        {Array.from({ length: total }, (_, index) => (
                            <Box
                                key={index}
                                className={classes.segment}
                                data-done={index < completed}
                            />
                        ))}
                    </Box>
                    <Box component="ul" className={classes.rows}>
                        {orderedRows.map((row) => (
                            <GuideRow
                                key={row.id}
                                row={row}
                                projectUuid={projectUuid}
                                {...handlers}
                            />
                        ))}
                    </Box>
                </Paper>
            )}
        </Affix>
    );
};

export const SetupGuide: FC<{
    projectUuid: string;
    actions: RecommendedActionsState;
    onAsk: () => void;
    withTour: boolean;
}> = ({ projectUuid, actions, onAsk, withTour }) => {
    const { track } = useTracking();
    const guide = useSetupGuide(projectUuid, actions);
    const aiAnswer = useCanAiAnswer(projectUuid, actions);
    if (guide.isLoading) return <Skeleton h={120} radius="md" />;
    if (!guide.isEligible) return null;
    return (
        <>
            <YourData
                projectUuid={projectUuid}
                actions={actions}
                guide={guide}
                onAsk={onAsk}
            />
            <SetupGuideView
                projectUuid={projectUuid}
                sections={guide.sections}
                isMinimized={guide.isDismissed}
                onMinimizedChange={guide.setIsDismissed}
                onAsk={onAsk}
                onSkip={(row) => {
                    if (row.actionKey) {
                        guide.skipAction(row.actionKey);
                    } else {
                        guide.skipRow(row.id);
                    }
                    track({
                        name: EventName.HOMEPAGE_RECOMMENDED_ACTION_SKIPPED,
                        properties: {
                            ...rowProperties(row, projectUuid),
                            choice: null,
                        },
                    });
                }}
                onRestore={(row) => {
                    if (row.actionKey) {
                        guide.restoreAction(row.actionKey);
                    } else {
                        guide.restoreRow(row.id);
                    }
                    track({
                        name: EventName.HOMEPAGE_RECOMMENDED_ACTION_RESTORED,
                        properties: {
                            ...rowProperties(row, projectUuid),
                            choice: null,
                        },
                    });
                }}
            />
            {withTour && <HomepageTour ready={aiAnswer.canAnswer} />}
        </>
    );
};
