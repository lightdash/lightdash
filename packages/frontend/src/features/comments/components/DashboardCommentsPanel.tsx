import { DashboardTileTypes, type Dashboard } from '@lightdash/common';
import {
    Button,
    Collapse,
    Divider,
    Drawer,
    Group,
    Paper,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconAppWindow,
    IconArrowUpRight,
    IconChartBar,
    IconChevronDown,
    IconChevronUp,
    IconHeading,
    IconMarkdown,
    IconMessages,
    IconSquareOff,
    IconVideo,
} from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import { scrollToDashboardTile } from '../../../components/common/Dashboard/scrollToDashboardTile';
import MantineIcon from '../../../components/common/MantineIcon';
import { PolymorphicGroupButton } from '../../../components/common/PolymorphicGroupButton';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import { useGetResolvedComments } from '../hooks/useComments';
import {
    countThreads,
    groupCommentsByTile,
    sectionGroupsByTab,
    type TileCommentGroup,
    type TileCommentSection,
} from '../utils/groupCommentsByTile';
import { DashboardCommentAndReplies } from './DashboardCommentAndReplies';
import classes from './DashboardCommentsPanel.module.css';

type Props = {
    opened: boolean;
    onClose: () => void;
    activeTabUuid: string | undefined;
    dashboardTabs: Dashboard['tabs'];
    onSwitchTab: (tab: Dashboard['tabs'][number]) => void;
};

const PANEL_WIDTH = 420;
// Long enough for the tab switch to mount its tiles before scrolling.
const TAB_SWITCH_SCROLL_DELAY_MS = 150;

const tileIcon = (tileType: DashboardTileTypes | null) => {
    switch (tileType) {
        case DashboardTileTypes.SAVED_CHART:
        case DashboardTileTypes.SQL_CHART:
            return IconChartBar;
        case DashboardTileTypes.MARKDOWN:
            return IconMarkdown;
        case DashboardTileTypes.LOOM:
            return IconVideo;
        case DashboardTileTypes.HEADING:
            return IconHeading;
        case DashboardTileTypes.DATA_APP:
            return IconAppWindow;
        case null:
            return IconSquareOff;
        default:
            return IconChartBar;
    }
};

const TileCard: FC<{
    group: TileCommentGroup;
    projectUuid: string;
    dashboardUuid: string;
    isResolved: boolean;
    onGoToTile: (group: TileCommentGroup) => void;
}> = ({ group, projectUuid, dashboardUuid, isResolved, onGoToTile }) => {
    const canGoToTile = group.tileType !== null;
    return (
        <Paper
            className={classes.tileCard}
            data-testid="dashboard-comments-group"
        >
            <Tooltip
                label="Go to tile"
                position="top-start"
                openDelay={400}
                disabled={!canGoToTile}
            >
                <PolymorphicGroupButton
                    component="div"
                    role={canGoToTile ? 'button' : undefined}
                    tabIndex={canGoToTile ? 0 : undefined}
                    aria-label={
                        canGoToTile ? `Go to tile ${group.title}` : undefined
                    }
                    data-clickable={canGoToTile || undefined}
                    className={classes.tileHeader}
                    gap="xs"
                    wrap="nowrap"
                    onClick={canGoToTile ? () => onGoToTile(group) : undefined}
                    onKeyDown={(event) => {
                        if (
                            canGoToTile &&
                            (event.key === 'Enter' || event.key === ' ')
                        ) {
                            event.preventDefault();
                            onGoToTile(group);
                        }
                    }}
                >
                    <MantineIcon
                        icon={tileIcon(group.tileType)}
                        color="dimmed"
                    />
                    <Text
                        fz="xs"
                        fw={500}
                        c={canGoToTile ? undefined : 'dimmed'}
                        truncate
                        className={classes.tileTitle}
                    >
                        {group.title}
                    </Text>
                    {canGoToTile && (
                        <MantineIcon
                            icon={IconArrowUpRight}
                            color="dimmed"
                            className={classes.goToIcon}
                        />
                    )}
                </PolymorphicGroupButton>
            </Tooltip>
            {group.threads.map((thread) => (
                <div key={thread.commentId} className={classes.thread}>
                    <DashboardCommentAndReplies
                        comment={thread}
                        projectUuid={projectUuid}
                        dashboardUuid={dashboardUuid}
                        dashboardTileUuid={group.tileUuid}
                        targetRef={null}
                        isResolved={isResolved}
                    />
                </div>
            ))}
        </Paper>
    );
};

const SectionList: FC<{
    sections: TileCommentSection[];
    showSectionHeaders: boolean;
    activeTabUuid: string | undefined;
    projectUuid: string;
    dashboardUuid: string;
    isResolved: boolean;
    onSelectTab: (tabUuid: string) => void;
    onGoToTile: (group: TileCommentGroup) => void;
}> = ({
    sections,
    showSectionHeaders,
    activeTabUuid,
    projectUuid,
    dashboardUuid,
    isResolved,
    onSelectTab,
    onGoToTile,
}) => (
    <>
        {sections.map((section) => {
            const { tabUuid } = section;
            const isActive = tabUuid !== null && tabUuid === activeTabUuid;
            const canSelect = tabUuid !== null && !isActive;
            return (
                <div
                    key={section.tabUuid ?? 'removed'}
                    className={classes.section}
                >
                    {(showSectionHeaders || tabUuid === null) && (
                        <PolymorphicGroupButton
                            component="div"
                            role={canSelect ? 'button' : undefined}
                            tabIndex={canSelect ? 0 : undefined}
                            className={classes.sectionHeader}
                            data-active={isActive || undefined}
                            gap="xs"
                            wrap="nowrap"
                            onClick={
                                tabUuid !== null && canSelect
                                    ? () => onSelectTab(tabUuid)
                                    : undefined
                            }
                        >
                            <Text
                                fz="xs"
                                fw={500}
                                c={isActive ? undefined : 'dimmed'}
                                truncate
                                className={classes.sectionLabel}
                            >
                                {section.label}
                            </Text>
                            <Text fz="xs" c="dimmed">
                                {countThreads(section.groups)}
                            </Text>
                        </PolymorphicGroupButton>
                    )}
                    <Stack gap="xs">
                        {section.groups.map((group) => (
                            <TileCard
                                key={group.tileUuid}
                                group={group}
                                projectUuid={projectUuid}
                                dashboardUuid={dashboardUuid}
                                isResolved={isResolved}
                                onGoToTile={onGoToTile}
                            />
                        ))}
                    </Stack>
                </div>
            );
        })}
    </>
);

export const DashboardCommentsPanel: FC<Props> = ({
    opened,
    onClose,
    activeTabUuid,
    dashboardTabs,
    onSwitchTab,
}) => {
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const openComments = useDashboardContext((c) => c.dashboardComments);
    const canCreateDashboardComments = !!useDashboardContext(
        (c) => c.dashboardCommentsCheck?.canCreateDashboardComments,
    );
    const canViewDashboardComments = !!useDashboardContext(
        (c) => c.dashboardCommentsCheck?.canViewDashboardComments,
    );

    const [showResolved, { toggle: toggleShowResolved }] = useDisclosure(false);

    const { data: resolvedComments } = useGetResolvedComments(
        dashboardUuid ?? '',
        projectUuid,
        opened && canViewDashboardComments && !!dashboardUuid,
    );

    const openGroups = useMemo(
        () =>
            groupCommentsByTile({
                commentsByTile: openComments ?? {},
                tiles: dashboardTiles ?? [],
                tabs: dashboardTabs,
            }),
        [openComments, dashboardTiles, dashboardTabs],
    );
    const resolvedGroups = useMemo(
        () =>
            groupCommentsByTile({
                commentsByTile: resolvedComments ?? {},
                tiles: dashboardTiles ?? [],
                tabs: dashboardTabs,
            }),
        [resolvedComments, dashboardTiles, dashboardTabs],
    );
    const openSections = useMemo(
        () => sectionGroupsByTab(openGroups, dashboardTabs),
        [openGroups, dashboardTabs],
    );
    const resolvedSections = useMemo(
        () => sectionGroupsByTab(resolvedGroups, dashboardTabs),
        [resolvedGroups, dashboardTabs],
    );
    const openCount = countThreads(openGroups);
    const resolvedCount = countThreads(resolvedGroups);
    const hasTabs = dashboardTabs.length > 1;

    const handleSelectTab = useCallback(
        (tabUuid: string) => {
            const tab = dashboardTabs.find((t) => t.uuid === tabUuid);
            if (tab) onSwitchTab(tab);
        },
        [dashboardTabs, onSwitchTab],
    );

    const handleGoToTile = useCallback(
        (group: TileCommentGroup) => {
            if (group.tabUuid && group.tabUuid !== activeTabUuid) {
                handleSelectTab(group.tabUuid);
                setTimeout(
                    () => scrollToDashboardTile(group.tileUuid),
                    TAB_SWITCH_SCROLL_DELAY_MS,
                );
                return;
            }
            scrollToDashboardTile(group.tileUuid);
        },
        [activeTabUuid, handleSelectTab],
    );

    if (!projectUuid || !dashboardUuid) return null;

    const summary = [
        `${openCount} open`,
        ...(resolvedCount > 0 ? [`${resolvedCount} resolved`] : []),
    ].join(' · ');

    return (
        <Drawer.Root
            opened={opened}
            onClose={onClose}
            position="right"
            size={PANEL_WIDTH}
            lockScroll={false}
        >
            <Drawer.Overlay opacity={0.1} blur={0} />
            <Drawer.Content data-testid="dashboard-comments-panel">
                <Drawer.Header>
                    <Drawer.Title>
                        <Group gap="xs" wrap="nowrap">
                            <Paper p="6px" radius="md" bg="ldGray.0">
                                <MantineIcon
                                    icon={IconMessages}
                                    size="sm"
                                    color="ldDark.9"
                                />
                            </Paper>
                            <div>
                                <Text fw={600} fz="sm">
                                    Comments
                                </Text>
                                <Text fz="xs" c="dimmed">
                                    {summary}
                                </Text>
                            </div>
                        </Group>
                    </Drawer.Title>
                    <Drawer.CloseButton />
                </Drawer.Header>
                <Drawer.Body className={classes.body}>
                    <div className={classes.list}>
                        {openCount === 0 && (
                            <Paper variant="dotted" p="lg">
                                <Stack gap="two">
                                    <Text fz="sm" fw={500} ta="center">
                                        No open comments
                                    </Text>
                                    <Text fz="xs" c="dimmed" ta="center">
                                        {canCreateDashboardComments
                                            ? 'Hover over a tile and use its speech bubble to start a thread.'
                                            : 'Threads started on any tile will show up here.'}
                                    </Text>
                                </Stack>
                            </Paper>
                        )}
                        <SectionList
                            sections={openSections}
                            showSectionHeaders={hasTabs}
                            activeTabUuid={activeTabUuid}
                            projectUuid={projectUuid}
                            dashboardUuid={dashboardUuid}
                            isResolved={false}
                            onSelectTab={handleSelectTab}
                            onGoToTile={handleGoToTile}
                        />
                        {resolvedCount > 0 && (
                            <>
                                <Divider
                                    className={classes.resolvedToggle}
                                    labelPosition="left"
                                    label={
                                        <Button
                                            size="compact-xs"
                                            variant="subtle"
                                            color="gray"
                                            fz="xs"
                                            onClick={toggleShowResolved}
                                            rightSection={
                                                <MantineIcon
                                                    icon={
                                                        showResolved
                                                            ? IconChevronUp
                                                            : IconChevronDown
                                                    }
                                                />
                                            }
                                        >
                                            {showResolved ? 'Hide' : 'Show'}{' '}
                                            resolved ({resolvedCount})
                                        </Button>
                                    }
                                />
                                <Collapse expanded={showResolved}>
                                    <SectionList
                                        sections={resolvedSections}
                                        showSectionHeaders={hasTabs}
                                        activeTabUuid={activeTabUuid}
                                        projectUuid={projectUuid}
                                        dashboardUuid={dashboardUuid}
                                        isResolved
                                        onSelectTab={handleSelectTab}
                                        onGoToTile={handleGoToTile}
                                    />
                                </Collapse>
                            </>
                        )}
                    </div>
                </Drawer.Body>
            </Drawer.Content>
        </Drawer.Root>
    );
};
