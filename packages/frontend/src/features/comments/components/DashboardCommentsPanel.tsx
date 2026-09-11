import { DashboardTileTypes, type Dashboard } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Drawer,
    Group,
    Loader,
    Paper,
    ScrollArea,
    SegmentedControl,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconAppWindow,
    IconChartBar,
    IconFocusCentered,
    IconHeading,
    IconMarkdown,
    IconMessages,
    IconSquareOff,
    IconVideo,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { scrollToDashboardTile } from '../../../components/common/Dashboard/scrollToDashboardTile';
import MantineIcon from '../../../components/common/MantineIcon';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import { useGetResolvedComments } from '../hooks/useComments';
import {
    countThreads,
    groupCommentsByTile,
    type TileCommentGroup,
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

type ThreadView = 'open' | 'resolved';

const PANEL_WIDTH = 440;
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

const TileGroup: FC<{
    group: TileCommentGroup;
    tabName: string | undefined;
    projectUuid: string;
    dashboardUuid: string;
    isResolved: boolean;
    onGoToTile: (group: TileCommentGroup) => void;
}> = ({
    group,
    tabName,
    projectUuid,
    dashboardUuid,
    isResolved,
    onGoToTile,
}) => {
    const canGoToTile = group.tileType !== null;
    return (
        <div className={classes.group} data-testid="dashboard-comments-group">
            <Group
                className={classes.groupHeader}
                justify="space-between"
                wrap="nowrap"
                gap="xs"
            >
                <Group gap="xs" wrap="nowrap" className={classes.groupTitle}>
                    <MantineIcon
                        icon={tileIcon(group.tileType)}
                        color="ldGray.6"
                    />
                    <Text fz="xs" fw={600} truncate>
                        {group.title}
                    </Text>
                    {tabName && (
                        <Badge
                            size="xs"
                            variant="light"
                            color="gray"
                            className={classes.tabBadge}
                        >
                            {tabName}
                        </Badge>
                    )}
                </Group>
                {canGoToTile && (
                    <Tooltip label="Go to tile" position="left">
                        <ActionIcon
                            className={classes.goToTile}
                            size="xs"
                            variant="subtle"
                            color="gray"
                            aria-label={`Go to tile ${group.title}`}
                            onClick={() => onGoToTile(group)}
                        >
                            <MantineIcon icon={IconFocusCentered} />
                        </ActionIcon>
                    </Tooltip>
                )}
            </Group>
            <Stack gap="sm">
                {group.threads.map((thread) => (
                    <DashboardCommentAndReplies
                        key={thread.commentId}
                        comment={thread}
                        projectUuid={projectUuid}
                        dashboardUuid={dashboardUuid}
                        dashboardTileUuid={group.tileUuid}
                        targetRef={null}
                        isResolved={isResolved}
                    />
                ))}
            </Stack>
        </div>
    );
};

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

    const [view, setView] = useState<ThreadView>('open');

    const { data: resolvedComments, isInitialLoading: isLoadingResolved } =
        useGetResolvedComments(
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
    const openCount = countThreads(openGroups);
    const resolvedCount = countThreads(resolvedGroups);

    const tabNames = useMemo(
        () => new Map(dashboardTabs.map((tab) => [tab.uuid, tab.name])),
        [dashboardTabs],
    );
    const hasTabs = dashboardTabs.length > 1;

    const handleGoToTile = useCallback(
        (group: TileCommentGroup) => {
            const targetTab = group.tabUuid
                ? dashboardTabs.find((tab) => tab.uuid === group.tabUuid)
                : undefined;
            if (targetTab && targetTab.uuid !== activeTabUuid) {
                onSwitchTab(targetTab);
                setTimeout(
                    () => scrollToDashboardTile(group.tileUuid),
                    TAB_SWITCH_SCROLL_DELAY_MS,
                );
                return;
            }
            scrollToDashboardTile(group.tileUuid);
        },
        [activeTabUuid, dashboardTabs, onSwitchTab],
    );

    if (!projectUuid || !dashboardUuid) return null;

    const groups = view === 'open' ? openGroups : resolvedGroups;
    const isResolvedView = view === 'resolved';

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
                        <Group gap="xs">
                            <Paper p="6px" radius="md" bg="ldGray.0">
                                <MantineIcon
                                    icon={IconMessages}
                                    size="sm"
                                    color="ldDark.9"
                                />
                            </Paper>
                            <Text fw={600} fz="sm">
                                Comments
                            </Text>
                        </Group>
                    </Drawer.Title>
                    <Drawer.CloseButton />
                </Drawer.Header>
                <Drawer.Body className={classes.body}>
                    <div className={classes.toolbar}>
                        <SegmentedControl
                            fullWidth
                            size="xs"
                            value={view}
                            onChange={(value) => setView(value as ThreadView)}
                            data={[
                                { value: 'open', label: `Open (${openCount})` },
                                {
                                    value: 'resolved',
                                    label: isLoadingResolved
                                        ? 'Resolved'
                                        : `Resolved (${resolvedCount})`,
                                },
                            ]}
                        />
                    </div>
                    <ScrollArea className={classes.scroll} type="hover">
                        {isResolvedView && isLoadingResolved ? (
                            <Group justify="center" className={classes.empty}>
                                <Loader size="sm" color="gray" />
                            </Group>
                        ) : groups.length === 0 ? (
                            <Stack gap="two" className={classes.empty}>
                                <Text fz="sm" fw={500} ta="center">
                                    {isResolvedView
                                        ? 'No resolved comments'
                                        : 'No open comments'}
                                </Text>
                                {!isResolvedView && (
                                    <Text fz="xs" c="dimmed" ta="center">
                                        {canCreateDashboardComments
                                            ? 'Hover over a tile and use its speech bubble to start a thread.'
                                            : 'Threads started on any tile will show up here.'}
                                    </Text>
                                )}
                            </Stack>
                        ) : (
                            groups.map((group) => (
                                <TileGroup
                                    key={group.tileUuid}
                                    group={group}
                                    tabName={
                                        hasTabs && group.tabUuid
                                            ? tabNames.get(group.tabUuid)
                                            : undefined
                                    }
                                    projectUuid={projectUuid}
                                    dashboardUuid={dashboardUuid}
                                    isResolved={isResolvedView}
                                    onGoToTile={handleGoToTile}
                                />
                            ))
                        )}
                    </ScrollArea>
                </Drawer.Body>
            </Drawer.Content>
        </Drawer.Root>
    );
};
