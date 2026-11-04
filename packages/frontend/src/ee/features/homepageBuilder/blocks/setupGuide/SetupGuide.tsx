import { type HomepageRecommendedActionKey } from '@lightdash/common';
import {
    ActionIcon,
    Affix,
    Box,
    Button,
    Group,
    HoverCard,
    Menu,
    Paper,
    Skeleton,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconArrowDownLeft,
    IconBrandSlack,
    IconChartBar,
    IconChevronRight,
    IconCircleCheckFilled,
    IconDatabase,
    IconDots,
    IconGitBranch,
    IconLayersLinked,
    IconListCheck,
    IconPalette,
    IconPlugConnected,
    IconUsers,
    type Icon,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AI_NAME } from '../../../../../components/common/aiName';
import MantineIcon from '../../../../../components/common/MantineIcon';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import { type RecommendedActionsState } from '../useRecommendedActions';
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
import { useSetupGuide } from './useSetupGuide';
import { YourData } from './YourData';

const ROW_COPY: Record<
    SetupGuideRowId,
    { icon: Icon; pitch: string; time: string }
> = {
    warehouse: {
        icon: IconDatabase,
        pitch: `${AI_NAME} answers by querying your warehouse.`,
        time: '3 min',
    },
    'app-data': {
        icon: IconPlugConnected,
        pitch: `${AI_NAME} can combine PostHog or GA4 with your metrics.`,
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
    'source-control': {
        icon: IconGitBranch,
        pitch: 'Keep your models in Git and review changes as pull requests.',
        time: '3 min',
    },
    brand: {
        icon: IconPalette,
        pitch: 'Your colors and logo on every chart and dashboard.',
        time: '1 min',
    },
    slack: {
        icon: IconBrandSlack,
        pitch: `Tag @${AI_NAME} in any channel and get answers in the thread.`,
        time: '1 min',
    },
    'invite-team': {
        icon: IconUsers,
        pitch: 'Teammates can answer their own questions.',
        time: '1 min',
    },
};

const isAskChoice = (choice: SetupGuideChoice) => choice.kind === 'ask';

type RowHandlers = {
    // Ask rows fill the composer on this page instead of leaving it
    onAsk: () => void;
    onSkip: (actionKey: HomepageRecommendedActionKey) => void;
    onRestore: (actionKey: HomepageRecommendedActionKey) => void;
};

const RowMenu: FC<{ row: SetupGuideRow } & RowHandlers> = ({
    row,
    onSkip,
    onRestore,
}) => {
    const { actionKey } = row;
    if (!actionKey) return null;
    const canSkip = row.status === 'suggested' && isSkippableRow(row);
    const canRestore = row.status === 'skipped';
    if (!canSkip && !canRestore) return null;
    return (
        <Menu position="bottom-end" withinPortal>
            <Menu.Target>
                <ActionIcon
                    size="sm"
                    aria-label={`More options for ${row.title}`}
                >
                    <MantineIcon icon={IconDots} />
                </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
                {canSkip ? (
                    <Menu.Item onClick={() => onSkip(actionKey)}>
                        Skip for now
                    </Menu.Item>
                ) : (
                    <Menu.Item onClick={() => onRestore(actionKey)}>
                        Add back to the list
                    </Menu.Item>
                )}
            </Menu.Dropdown>
        </Menu>
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

const GuideRow: FC<{ row: SetupGuideRow } & RowHandlers> = ({
    row,
    ...handlers
}) => {
    const { track } = useTracking();
    const copy = ROW_COPY[row.id];
    const content: ReactNode = (
        <>
            <Box className={classes.rowIcon}>
                <MantineIcon icon={copy.icon} size={14} />
            </Box>
            <Box className={classes.grow}>
                <Text fz="sm" truncate className={classes.rowTitle}>
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
            position="right-start"
            offset={24}
            width={row.choices.length > 0 ? 360 : 280}
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
                                    handlers.onAsk();
                                    return;
                                }
                                if (!row.actionKey) return;
                                track({
                                    name: EventName.HOMEPAGE_RECOMMENDED_ACTION_CLICKED,
                                    properties: {
                                        actionKey: row.actionKey,
                                        destination: action.to,
                                    },
                                });
                            }}
                        >
                            {content}
                        </Link>
                    ) : (
                        <Box className={classes.rowLink}>{content}</Box>
                    )}
                    <Box className={classes.reveal}>
                        <RowMenu row={row} {...handlers} />
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
                            Two ways to get there
                        </Text>
                        <Box className={classes.choices}>
                            {row.choices.map((choice) => (
                                <Link
                                    key={choice.kind}
                                    to={choice.to}
                                    className={classes.choice}
                                    onClick={(event) => {
                                        if (!isAskChoice(choice)) return;
                                        event.preventDefault();
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
    sections: SetupGuideSection[];
    isMinimized: boolean;
    onMinimizedChange: (isMinimized: boolean) => void;
} & RowHandlers;

/** The setup checklist, docked in the corner so the chat keeps the page */
export const SetupGuideView: FC<SetupGuideViewProps> = ({
    sections,
    isMinimized,
    onMinimizedChange,
    ...handlers
}) => {
    const rows = sections.flatMap((section) => section.rows);
    const { completed, total } = countProgress(rows);
    // Skipped rows are out of the total, so this means nothing is left to do
    if (completed === total) return null;
    // Skipped steps sink to the bottom so the list reads as what is left
    const orderedRows = [
        ...rows.filter((row) => row.status !== 'skipped'),
        ...rows.filter((row) => row.status === 'skipped'),
    ];
    return (
        <Affix position={{ bottom: 16, left: 16 }}>
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
                        <Box>
                            <Text fz="sm" fw={600}>
                                Getting started
                            </Text>
                            <Text fz="xs" c="dimmed">
                                {completed} of {total} steps done
                            </Text>
                        </Box>
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
                            <GuideRow key={row.id} row={row} {...handlers} />
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
}> = ({ projectUuid, actions, onAsk }) => {
    const { track } = useTracking();
    const guide = useSetupGuide(projectUuid, actions);
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
                sections={guide.sections}
                isMinimized={guide.isDismissed}
                onMinimizedChange={guide.setIsDismissed}
                onAsk={onAsk}
                onSkip={(actionKey) => {
                    guide.skipAction(actionKey);
                    track({
                        name: EventName.HOMEPAGE_RECOMMENDED_ACTION_SKIPPED,
                        properties: { actionKey },
                    });
                }}
                onRestore={(actionKey) => {
                    guide.restoreAction(actionKey);
                    track({
                        name: EventName.HOMEPAGE_RECOMMENDED_ACTION_RESTORED,
                        properties: { actionKey },
                    });
                }}
            />
        </>
    );
};
