import {
    preAggregateMissReasonLabels,
    type Dashboard,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Collapse,
    Drawer,
    Group,
    Paper,
    ScrollArea,
    Stack,
    Text,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconBolt,
    IconChevronDown,
    IconChevronUp,
    IconViewfinder,
} from '@tabler/icons-react';
import { useCallback, useMemo } from 'react';
import { type TilePreAggregateStatus } from '../../../providers/Dashboard/types';
import MantineIcon from '../MantineIcon';
import { PolymorphicGroupButton } from '../PolymorphicGroupButton';
import classes from './PreAggregateAuditIndicator.module.css';

const NONE_KEY = 'none';

type Props = {
    opened: boolean;
    onClose: () => void;
    statuses: Record<string, TilePreAggregateStatus>;
    activeTabUuid: string | undefined;
    dashboardTabs: Dashboard['tabs'];
    onSwitchTab: (tab: Dashboard['tabs'][number]) => void;
};

type TabGroup = {
    tabUuid: string | undefined;
    tabName: string;
    hits: TilePreAggregateStatus[];
    misses: TilePreAggregateStatus[];
    ineligible: TilePreAggregateStatus[];
};

function getDetail(tile: TilePreAggregateStatus): string {
    if (tile.hit && tile.preAggregateName) {
        return tile.preAggregateName;
    }
    if (!tile.hit && tile.reason) {
        return preAggregateMissReasonLabels[tile.reason.reason];
    }
    return '—';
}

function scrollToTile(tileUuid: string) {
    const el = document.querySelector<HTMLElement>(
        `[data-tile-uuid="${tileUuid}"]`,
    );
    if (!el) return;

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.borderRadius = 'var(--mantine-radius-md)';
    el.animate(
        [
            { boxShadow: '0 0 0 0px transparent' },
            { boxShadow: '0 0 0 2px var(--mantine-color-indigo-4)' },
            { boxShadow: '0 0 0 0px transparent' },
        ],
        { duration: 1200, easing: 'ease-in-out' },
    );
}

function TileRow({
    tile,
    onClick,
}: {
    tile: TilePreAggregateStatus;
    onClick: (uuid: string) => void;
}) {
    return (
        <Box className={classes.tileRow} onClick={() => onClick(tile.tileUuid)}>
            <Group gap="xs" justify="space-between" wrap="nowrap">
                <Text fz="xs" lineClamp={1} className={classes.tileName}>
                    {tile.tileName}
                </Text>
                <Box className={classes.scrollIcon}>
                    <MantineIcon
                        icon={IconViewfinder}
                        size={12}
                        color="ldDark.9"
                    />
                </Box>
            </Group>
            <Text fz={10} className={classes.tileDetail}>
                {getDetail(tile)}
            </Text>
        </Box>
    );
}

function TileList({
    tiles,
    onClick,
}: {
    tiles: TilePreAggregateStatus[];
    onClick: (uuid: string) => void;
}) {
    return (
        <Stack gap={1}>
            {tiles.map((tile) => (
                <TileRow key={tile.tileUuid} tile={tile} onClick={onClick} />
            ))}
        </Stack>
    );
}

function IneligibleSection({ tiles }: { tiles: TilePreAggregateStatus[] }) {
    const [open, { toggle }] = useDisclosure(false);

    if (tiles.length === 0) return null;
    return (
        <Box>
            <PolymorphicGroupButton gap="xs" onClick={toggle}>
                <MantineIcon
                    icon={open ? IconChevronUp : IconChevronDown}
                    size="xs"
                    color="ldGray.5"
                />
                <Text fz={11} className={classes.tileDetail}>
                    {tiles.length} without pre-aggregates
                </Text>
            </PolymorphicGroupButton>
            <Collapse in={open}>
                <Stack gap={1} mt={4}>
                    {tiles.map((tile) => (
                        <Text
                            key={tile.tileUuid}
                            fz="xs"
                            className={classes.ineligibleTile}
                        >
                            {tile.tileName}
                        </Text>
                    ))}
                </Stack>
            </Collapse>
        </Box>
    );
}

function buildTabGroup(
    tiles: TilePreAggregateStatus[],
    tabUuid: string | undefined,
    tabName: string,
): TabGroup {
    const sort = (a: TilePreAggregateStatus, b: TilePreAggregateStatus) =>
        a.tileName.localeCompare(b.tileName);
    return {
        tabUuid,
        tabName,
        hits: tiles
            .filter((t) => t.hasPreAggregateMetadata && t.hit)
            .sort(sort),
        misses: tiles
            .filter((t) => t.hasPreAggregateMetadata && !t.hit)
            .sort(sort),
        ineligible: tiles.filter((t) => !t.hasPreAggregateMetadata).sort(sort),
    };
}

function GroupContent({
    group,
    onClick,
}: {
    group: TabGroup;
    onClick: (uuid: string) => void;
}) {
    const hasHits = group.hits.length > 0;
    const hasMisses = group.misses.length > 0;

    return (
        <Stack gap="xs">
            {hasHits && (
                <Stack gap={2}>
                    <Badge size="xs" variant="light" color="green" radius="sm">
                        {group.hits.length} hit
                    </Badge>
                    <TileList tiles={group.hits} onClick={onClick} />
                </Stack>
            )}
            {hasMisses && (
                <Stack gap={2}>
                    <Badge size="xs" variant="light" color="red" radius="sm">
                        {group.misses.length} miss
                    </Badge>
                    <TileList tiles={group.misses} onClick={onClick} />
                </Stack>
            )}
            <IneligibleSection tiles={group.ineligible} />
        </Stack>
    );
}

export function PreAggregateAuditDrawer({
    opened,
    onClose,
    statuses,
    activeTabUuid,
    dashboardTabs,
    onSwitchTab,
}: Props) {
    const hasTabs = dashboardTabs.length > 1;

    const tabGroups = useMemo(() => {
        const all = Object.values(statuses);

        if (!hasTabs) {
            return [buildTabGroup(all, undefined, '')];
        }

        const tabNameMap: Record<string, string> = {};
        const tabOrder: string[] = [];
        for (const tab of dashboardTabs) {
            tabNameMap[tab.uuid] = tab.name;
            tabOrder.push(tab.uuid);
        }

        const grouped: Record<string, TilePreAggregateStatus[]> = {};
        for (const tile of all) {
            const key = tile.tabUuid ?? NONE_KEY;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(tile);
        }

        const result: TabGroup[] = [];
        for (const tabUuid of tabOrder) {
            const tiles = grouped[tabUuid] ?? [];
            result.push(
                buildTabGroup(tiles, tabUuid, tabNameMap[tabUuid] ?? tabUuid),
            );
        }

        const orphans = grouped[NONE_KEY];
        if (orphans && orphans.length > 0) {
            result.push(buildTabGroup(orphans, undefined, 'Other'));
        }

        return result;
    }, [statuses, hasTabs, dashboardTabs]);

    const handleTabClick = useCallback(
        (tabUuid: string | undefined) => {
            if (!tabUuid) return;
            const tab = dashboardTabs.find((t) => t.uuid === tabUuid);
            if (tab) onSwitchTab(tab);
        },
        [dashboardTabs, onSwitchTab],
    );

    const handleTileClick = useCallback((uuid: string) => {
        scrollToTile(uuid);
    }, []);

    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            position="right"
            lockScroll={false}
            size="sm"
            title={
                <Group gap="xs">
                    <Paper p="6px" withBorder radius="md" bg="ldGray.0">
                        <MantineIcon
                            icon={IconBolt}
                            size="sm"
                            color="ldDark.9"
                        />
                    </Paper>
                    <Text fw={600} fz="sm">
                        Pre-aggregation audit
                    </Text>
                </Group>
            }
            overlayProps={{ opacity: 0.1, blur: 0 }}
            withCloseButton
        >
            <ScrollArea h="calc(100vh - 80px)">
                {hasTabs ? (
                    <Stack gap={0}>
                        {tabGroups.map((group) => {
                            const isActive = group.tabUuid === activeTabUuid;
                            const totalEligible =
                                group.hits.length + group.misses.length;

                            return (
                                <Box
                                    key={group.tabUuid ?? NONE_KEY}
                                    className={classes.tabBlock}
                                    data-active={isActive || undefined}
                                >
                                    <PolymorphicGroupButton
                                        gap="xs"
                                        onClick={() =>
                                            handleTabClick(group.tabUuid)
                                        }
                                        className={classes.tabLabel}
                                        data-active={isActive || undefined}
                                    >
                                        <Text fz="xs" fw={isActive ? 600 : 400}>
                                            {group.tabName}
                                        </Text>
                                        {totalEligible > 0 && (
                                            <Group gap={4} wrap="nowrap">
                                                {group.hits.length > 0 && (
                                                    <Badge
                                                        size="xs"
                                                        variant="dot"
                                                        color="green"
                                                    >
                                                        {group.hits.length}
                                                    </Badge>
                                                )}
                                                {group.misses.length > 0 && (
                                                    <Badge
                                                        size="xs"
                                                        variant="dot"
                                                        color="red"
                                                    >
                                                        {group.misses.length}
                                                    </Badge>
                                                )}
                                            </Group>
                                        )}
                                    </PolymorphicGroupButton>

                                    <Collapse in={isActive}>
                                        <Box className={classes.tabBody}>
                                            {group.hits.length === 0 &&
                                            group.misses.length === 0 &&
                                            group.ineligible.length === 0 ? (
                                                <Text fz="xs" c="dimmed">
                                                    No results yet — visit this
                                                    tab to load tiles.
                                                </Text>
                                            ) : (
                                                <GroupContent
                                                    group={group}
                                                    onClick={handleTileClick}
                                                />
                                            )}
                                        </Box>
                                    </Collapse>
                                </Box>
                            );
                        })}
                    </Stack>
                ) : (
                    tabGroups[0] && (
                        <GroupContent
                            group={tabGroups[0]}
                            onClick={handleTileClick}
                        />
                    )
                )}
            </ScrollArea>
        </Drawer>
    );
}
