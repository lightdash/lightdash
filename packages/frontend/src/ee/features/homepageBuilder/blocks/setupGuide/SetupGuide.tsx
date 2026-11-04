import { type HomepageRecommendedActionKey } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    Menu,
    Paper,
    Popover,
    Progress,
    Skeleton,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import {
    IconArrowRight,
    IconArrowsMaximize,
    IconBrandSlack,
    IconCheck,
    IconChevronDown,
    IconDatabase,
    IconDots,
    IconEyeOff,
    IconGitBranch,
    IconLayersLinked,
    IconLayoutDashboard,
    IconListCheck,
    IconPalette,
    IconPlugConnected,
    IconSparkles,
    IconUsers,
    IconX,
    type Icon,
} from '@tabler/icons-react';
import { useEffect, useState, type FC, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { AI_NAME } from '../../../../../components/common/aiName';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import { AgentOnboardingProgress } from '../../../agentOnboarding/AgentOnboardingProgress';
import {
    RunChanges,
    RunRecentSteps,
} from '../../../agentOnboarding/AgentOnboardingRunChanges';
import { getAgentOnboardingRunUrl } from '../../../agentOnboarding/utils';
import { type RecommendedActionsState } from '../useRecommendedActions';
import { SemanticLayerCard, StarterDashboardCard } from './SemanticLayerCard';
import classes from './SetupGuide.module.css';
import {
    countProgress,
    SETUP_GUIDE_CORNER_SLOT_ID,
    isCompletedStatus,
    isSkippableRow,
    type SetupGuideRow,
    type SetupGuideRowId,
    type SetupGuideSection,
} from './setupGuideModel';
import { StepArt } from './StepArt';
import { useSetupGuide } from './useSetupGuide';

const ROW_COPY: Record<
    SetupGuideRowId,
    { short: string; pitch: string; icon: Icon; time: string }
> = {
    warehouse: {
        short: 'warehouse',
        pitch: `${AI_NAME} answers by querying your warehouse.`,
        icon: IconDatabase,
        time: '3 min',
    },
    'app-data': {
        short: 'more sources',
        pitch: 'Ask AI can combine PostHog or Google Analytics with your metrics.',
        icon: IconPlugConnected,
        time: '2 min',
    },
    'semantic-layer': {
        short: 'metrics',
        pitch: 'Define revenue once and reuse it in charts and answers.',
        icon: IconLayersLinked,
        time: '5 min',
    },
    'source-control': {
        short: 'dbt project',
        pitch: 'Keep your models in Git and review changes as pull requests.',
        icon: IconGitBranch,
        time: '3 min',
    },
    'starter-dashboard': {
        short: 'first dashboard',
        pitch: 'Give people somewhere to begin.',
        icon: IconLayoutDashboard,
        time: '2 min',
    },
    brand: {
        short: 'brand',
        pitch: 'Your colors and logo on every chart and dashboard.',
        icon: IconPalette,
        time: '1 min',
    },
    slack: {
        short: 'Slack',
        pitch: `Tag @${AI_NAME} in any channel and get answers in the thread.`,
        icon: IconBrandSlack,
        time: '1 min',
    },
    'invite-team': {
        short: 'team',
        pitch: 'Teammates can answer their own questions.',
        icon: IconUsers,
        time: '1 min',
    },
};

const listFormat = new Intl.ListFormat('en', {
    style: 'long',
    type: 'conjunction',
});

const capitalize = (text: string) =>
    text.charAt(0).toUpperCase() + text.slice(1);

type RowHandlers = {
    onSkip: (actionKey: HomepageRecommendedActionKey) => void;
    onRestore: (actionKey: HomepageRecommendedActionKey) => void;
};

const RowAction: FC<{ row: SetupGuideRow; variant: 'filled' | 'default' }> = ({
    row,
    variant,
}) => {
    const { track } = useTracking();
    if (!row.action) return null;
    const { to, label } = row.action;
    return (
        <Button
            component={Link}
            to={to}
            variant={variant}
            size={variant === 'filled' ? 'xs' : 'compact-xs'}
            onClick={() => {
                if (!row.actionKey) return;
                track({
                    name: EventName.HOMEPAGE_RECOMMENDED_ACTION_CLICKED,
                    properties: { actionKey: row.actionKey, destination: to },
                });
            }}
        >
            {label}
        </Button>
    );
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
                <ActionIcon aria-label={`More options for ${row.title}`}>
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

const NextStepCard: FC<{ row: SetupGuideRow } & RowHandlers> = ({
    row,
    ...handlers
}) => {
    const copy = ROW_COPY[row.id];
    return (
        <Box className={classes.next}>
            <StepArt id={row.id} badge={`Next up, ${copy.time}`} size="lg" />
            <Box className={classes.nextBody}>
                <Text fz="sm" fw={600}>
                    {row.title}
                </Text>
                <Text fz="xs" c="dimmed">
                    {copy.pitch}
                </Text>
                <Group gap={4} wrap="nowrap" mt="auto" pt="sm">
                    <RowAction row={row} variant="filled" />
                    <Box className={classes.reveal}>
                        <RowMenu row={row} {...handlers} />
                    </Box>
                </Group>
            </Box>
        </Box>
    );
};

const StepCard: FC<{ row: SetupGuideRow; index: number } & RowHandlers> = ({
    row,
    index,
    ...handlers
}) => {
    const { track } = useTracking();
    const copy = ROW_COPY[row.id];
    const isSkipped = row.status === 'skipped';
    const title = (
        <>
            <Text fz="xs" fw={500} lineClamp={2} className={classes.cardTitle}>
                {row.title}
            </Text>
            {!isSkipped && row.action && (
                <MantineIcon
                    icon={IconArrowRight}
                    size={12}
                    className={classes.cardArrow}
                />
            )}
        </>
    );
    return (
        <Box
            className={classes.card}
            data-status={row.status}
            style={{ '--i': index }}
        >
            <StepArt
                id={row.id}
                badge={isSkipped ? 'Skipped' : copy.time}
                size="sm"
            />
            <Group
                gap={4}
                wrap="nowrap"
                align="flex-start"
                className={classes.cardBody}
            >
                {!isSkipped && row.action ? (
                    <Link
                        to={row.action.to}
                        className={classes.cardLink}
                        onClick={() => {
                            if (!row.actionKey || !row.action) return;
                            track({
                                name: EventName.HOMEPAGE_RECOMMENDED_ACTION_CLICKED,
                                properties: {
                                    actionKey: row.actionKey,
                                    destination: row.action.to,
                                },
                            });
                        }}
                    >
                        {title}
                    </Link>
                ) : (
                    <Box className={classes.cardLink}>{title}</Box>
                )}
                <Box className={`${classes.cardMenu} ${classes.reveal}`}>
                    <RowMenu row={row} {...handlers} />
                </Box>
            </Group>
        </Box>
    );
};

const AuroraLiveCard: FC<{ rows: SetupGuideRow[] }> = ({ rows }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const run = rows.find(({ preview }) => preview?.kind === 'agent-run')
        ?.preview?.run;
    const drafting = listFormat.format(
        rows.map(({ id }) => ROW_COPY[id].short),
    );
    const action = rows.find((row) => row.action)?.action;
    return (
        <Box className={classes.live}>
            <Group gap="sm" wrap="nowrap">
                <Box className={classes.liveDot} aria-hidden />
                <Box className={classes.grow}>
                    <Text fz="sm" fw={500}>
                        {AI_NAME} is drafting your {drafting}
                    </Text>
                    <Text fz="xs" c="dimmed">
                        Reading your tables and writing the YAML. Keep going,
                        this runs in the background.
                    </Text>
                </Box>
                {run ? (
                    <Button
                        variant="default"
                        size="compact-sm"
                        onClick={() => setIsModalOpen(true)}
                    >
                        Watch
                    </Button>
                ) : (
                    action && (
                        <Button
                            component={Link}
                            to={action.to}
                            variant="default"
                            size="compact-sm"
                        >
                            Watch
                        </Button>
                    )
                )}
            </Group>
            {run && (
                <MantineModal
                    opened={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    title={`${AI_NAME} is setting up your project`}
                    icon={IconSparkles}
                    size="lg"
                    cancelLabel={false}
                    headerActions={
                        <Tooltip label="Open full view">
                            <ActionIcon
                                component={Link}
                                to={getAgentOnboardingRunUrl(
                                    run.agentOnboardingRunUuid,
                                    run.projectUuid,
                                )}
                                variant="subtle"
                                color="gray"
                                aria-label="Open full view"
                            >
                                <MantineIcon icon={IconArrowsMaximize} />
                            </ActionIcon>
                        </Tooltip>
                    }
                >
                    <Stack gap="md">
                        <AgentOnboardingProgress run={run} />
                        <RunRecentSteps run={run} />
                        <Divider />
                        <RunChanges run={run} withModels />
                    </Stack>
                </MantineModal>
            )}
        </Box>
    );
};

const CompactRow: FC<{ row: SetupGuideRow } & RowHandlers> = ({
    row,
    ...handlers
}) => {
    const isDone = isCompletedStatus(row.status);
    return (
        <Box className={classes.row} data-status={row.status}>
            <Box className={classes.glyph} data-done={isDone}>
                {isDone && <MantineIcon icon={IconCheck} size={12} />}
            </Box>
            <Box className={classes.grow}>
                <Text fz="sm" truncate className={classes.rowTitle}>
                    {row.title}
                </Text>
                {isDone && row.evidence && (
                    <Group gap={6} wrap="nowrap" className={classes.evidence}>
                        {row.evidence.logo}
                        {row.evidence.swatches.map((hex) => (
                            <Box
                                key={hex}
                                className={classes.swatch}
                                bg={hex}
                                aria-hidden
                            />
                        ))}
                        <Text fz="xs" c="dimmed" truncate>
                            {row.evidence.text}
                        </Text>
                    </Group>
                )}
            </Box>
            <RowMenu row={row} {...handlers} />
            {row.status !== 'skipped' && (
                <RowAction row={row} variant="default" />
            )}
        </Box>
    );
};

type SetupGuideViewProps = {
    sections: SetupGuideSection[];
    isDismissed: boolean;
    onDismissedChange: (isDismissed: boolean) => void;
    highlight: ReactNode[];
    // The popover copy of the guide must not claim the corner slot its trigger lives in
    isNested?: boolean;
} & RowHandlers;

export const SetupGuideView: FC<SetupGuideViewProps> = ({
    sections,
    isDismissed,
    onDismissedChange,
    highlight,
    isNested = false,
    ...handlers
}) => {
    const [isDoneOpen, setIsDoneOpen] = useState(false);
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const [cornerSlot, setCornerSlot] = useState<HTMLElement | null>(null);
    useEffect(() => {
        if (isNested) return;
        setCornerSlot(document.getElementById(SETUP_GUIDE_CORNER_SLOT_ID));
    }, [isNested]);
    const rows = sections.flatMap((section) => section.rows);
    const { completed, total } = countProgress(rows);
    // Skipped rows are out of the total, so this means nothing is left to do
    if (completed === total) return <>{highlight}</>;
    if (isDismissed) {
        const reopenLabel = `Setup guide, ${completed} of ${total} done`;
        if (!cornerSlot) {
            return (
                <Button
                    variant="subtle"
                    size="compact-sm"
                    className={classes.reopen}
                    leftSection={<MantineIcon icon={IconListCheck} />}
                    onClick={() => onDismissedChange(false)}
                >
                    {reopenLabel}
                </Button>
            );
        }
        return createPortal(
            <Popover
                opened={isPopoverOpen}
                onChange={setIsPopoverOpen}
                position="bottom-end"
                width={760}
            >
                <Popover.Target>
                    <Button
                        variant="default"
                        size="sm"
                        aria-label={reopenLabel}
                        leftSection={<MantineIcon icon={IconListCheck} />}
                        onClick={() => setIsPopoverOpen((open) => !open)}
                    >
                        Setup {completed}/{total}
                    </Button>
                </Popover.Target>
                <Popover.Dropdown className={classes.popover}>
                    <SetupGuideView
                        sections={sections}
                        isDismissed={false}
                        onDismissedChange={() => setIsPopoverOpen(false)}
                        highlight={highlight}
                        isNested
                        {...handlers}
                    />
                    <Group justify="flex-end" className={classes.popoverFooter}>
                        <Button
                            variant="subtle"
                            color="gray"
                            size="compact-xs"
                            onClick={() => {
                                setIsPopoverOpen(false);
                                onDismissedChange(false);
                            }}
                        >
                            Show on homepage
                        </Button>
                    </Group>
                </Popover.Dropdown>
            </Popover>,
            cornerSlot,
        );
    }

    const doneRows = rows.filter((row) => isCompletedStatus(row.status));
    const buildingRows = rows.filter((row) => row.status === 'building');
    const todoRows = rows.filter((row) => row.status === 'suggested');
    const skippedRows = rows.filter((row) => row.status === 'skipped');
    // Connecting dbt is for teams that already have it, so it never takes the big slot
    // The top row holds two cards at most, so a full highlight pushes next up below
    const nextRow =
        highlight.length >= 2
            ? undefined
            : todoRows.find(({ id }) => id !== 'source-control');
    const laterRows = todoRows.filter((row) => row !== nextRow);

    return (
        <Paper p="md" className={classes.guide}>
            <Group justify="space-between" wrap="nowrap" mb="sm">
                <Text fz="sm" fw={500}>
                    Set up your workspace
                </Text>
                <Group gap="xs" wrap="nowrap">
                    <UnstyledButton
                        className={classes.doneLine}
                        disabled={doneRows.length === 0}
                        aria-expanded={isDoneOpen}
                        title={capitalize(
                            listFormat.format(
                                doneRows.map(({ id }) => ROW_COPY[id].short),
                            ),
                        )}
                        onClick={() => setIsDoneOpen((value) => !value)}
                    >
                        <Progress
                            value={(completed / total) * 100}
                            size={4}
                            w={64}
                            color="ldGray.5"
                            aria-label={`${completed} of ${total} setup steps done`}
                        />
                        <Text fz="xs" c="dimmed">
                            {completed} of {total} done
                        </Text>
                        {doneRows.length > 0 && (
                            <MantineIcon
                                icon={IconChevronDown}
                                size={12}
                                color="dimmed"
                                className={classes.chevron}
                                data-expanded={isDoneOpen}
                            />
                        )}
                    </UnstyledButton>
                    {cornerSlot ? (
                        createPortal(
                            <Button
                                variant="subtle"
                                color="gray"
                                size="sm"
                                leftSection={<MantineIcon icon={IconEyeOff} />}
                                onClick={() => onDismissedChange(true)}
                            >
                                Hide setup guide
                            </Button>,
                            cornerSlot,
                        )
                    ) : (
                        <Tooltip label="Hide setup guide">
                            <ActionIcon
                                className={classes.reveal}
                                aria-label="Hide setup guide"
                                onClick={() => onDismissedChange(true)}
                            >
                                <MantineIcon icon={IconX} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>
            </Group>

            <Stack gap="sm">
                {buildingRows.length > 0 && (
                    <AuroraLiveCard rows={buildingRows} />
                )}
                {(highlight.length > 0 || nextRow) && (
                    <Box className={classes.top}>
                        {highlight}
                        {nextRow && (
                            <NextStepCard
                                key={nextRow.id}
                                row={nextRow}
                                {...handlers}
                            />
                        )}
                    </Box>
                )}

                {(laterRows.length > 0 || skippedRows.length > 0) && (
                    <Box className={classes.cards}>
                        {[...laterRows, ...skippedRows].map((row, index) => (
                            <StepCard
                                key={row.id}
                                row={row}
                                index={index}
                                {...handlers}
                            />
                        ))}
                    </Box>
                )}

                {isDoneOpen && doneRows.length > 0 && (
                    <Box className={classes.list}>
                        {doneRows.map((row) => (
                            <CompactRow key={row.id} row={row} {...handlers} />
                        ))}
                    </Box>
                )}
            </Stack>
        </Paper>
    );
};

export const SetupGuide: FC<{
    projectUuid: string;
    actions: RecommendedActionsState;
}> = ({ projectUuid, actions }) => {
    const { track } = useTracking();
    const guide = useSetupGuide(projectUuid, actions);
    // Lifted here so a dismissed card also frees its slot in the top row
    const [isSemanticLayerDismissed, setIsSemanticLayerDismissed] =
        useLocalStorage({
            key: `ld.setupGuide.auroraResult.${projectUuid}`,
            defaultValue: false,
            getInitialValueInEffect: false,
        });
    const [isStarterDashboardDismissed, setIsStarterDashboardDismissed] =
        useLocalStorage({
            key: `ld.setupGuide.starterDashboard.${projectUuid}`,
            defaultValue: false,
            getInitialValueInEffect: false,
        });
    if (guide.isLoading) {
        // Mirrors the guide's grids so it holds about the same space
        return guide.isDismissed ? (
            <Skeleton h={30} w={180} className={classes.reopen} />
        ) : (
            <Stack gap="md" className={classes.guide}>
                <Skeleton h={28} w={240} radius="sm" />
                <Box className={classes.top}>
                    <Skeleton h={290} radius="md" />
                    <Skeleton h={290} radius="md" />
                </Box>
                <Box className={classes.cards}>
                    {Array.from({ length: 4 }, (_, index) => (
                        <Skeleton key={index} h={170} radius="md" />
                    ))}
                </Box>
            </Stack>
        );
    }
    if (!guide.isEligible) return null;
    const rows = guide.sections.flatMap((section) => section.rows);
    const semanticLayer = rows.find(({ id }) => id === 'semantic-layer');
    const starterDashboard = rows.find(({ id }) => id === 'starter-dashboard');
    const showSemanticLayer =
        semanticLayer?.status === 'done' && !isSemanticLayerDismissed;
    const showStarterDashboard =
        starterDashboard !== undefined &&
        !!starterDashboard.action &&
        isCompletedStatus(starterDashboard.status) &&
        !isStarterDashboardDismissed;
    return (
        <SetupGuideView
            sections={guide.sections}
            isDismissed={guide.isDismissed}
            onDismissedChange={guide.setIsDismissed}
            highlight={[
                showSemanticLayer && (
                    <SemanticLayerCard
                        key="semantic-layer"
                        projectUuid={projectUuid}
                        buildRunUrl={guide.completedRunUrl}
                        onDismiss={() => setIsSemanticLayerDismissed(true)}
                    />
                ),
                showStarterDashboard && (
                    <StarterDashboardCard
                        key="starter-dashboard"
                        starterDashboard={starterDashboard}
                        onDismiss={() => setIsStarterDashboardDismissed(true)}
                    />
                ),
            ].filter(Boolean)}
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
    );
};
