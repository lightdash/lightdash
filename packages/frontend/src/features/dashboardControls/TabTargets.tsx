import { Box, Checkbox, Group, Stack, Text, Tooltip } from '@mantine/core';
import { useMemo, type FC } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { getTabCounts, getTabTargetState, setTabTargets } from './peers';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

// One checkbox per dashboard tab: the filter on or off for every tile on it
export const TabTargets: FC = () => {
    const editingRule = useControlsSidebarSelector((c) => c.editingRule);
    const editingControl = useControlsSidebarSelector((c) => c.editingControl);
    const isPlaceholder = useControlsSidebarSelector((c) => c.isPlaceholder);
    const updateFilter = useControlsSidebarSelector((c) => c.updateFilter);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const fieldsByTile = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const sqlColumnsByTile = useSqlColumnsByTile(editingRule);

    const rule =
        isPlaceholder || editingControl !== null || dashboardTabs.length < 2
            ? null
            : editingRule;

    const rows = useMemo(() => {
        if (rule === null) return [];
        const tiles = dashboardTiles ?? [];
        const counts = getTabCounts(
            rule,
            tiles,
            dashboardTabs,
            fieldsByTile,
            sqlColumnsByTile,
        );
        return dashboardTabs.map((tab) => ({
            tab,
            count: counts[tab.uuid],
            state: getTabTargetState(
                rule,
                tab.uuid,
                tiles,
                fieldsByTile,
                sqlColumnsByTile,
            ),
        }));
    }, [rule, dashboardTiles, dashboardTabs, fieldsByTile, sqlColumnsByTile]);

    if (rule === null) return null;

    return (
        <Stack gap="xs">
            <Stack gap={2}>
                <Text fz="sm" fw={600}>
                    Tabs
                </Text>
                <Text fz="xs" c="dimmed">
                    Switch the filter on or off for every tile on a tab.
                </Text>
            </Stack>
            {rows.map(({ tab, count, state }) => {
                // As in the shipped popover: a partly filtered tab switches off
                const isOn = state.checked !== 'none';
                const isDisabled = !isOn && !state.canSwitchOn;
                return (
                    <Tooltip
                        key={tab.uuid}
                        fz="xs"
                        position="top-start"
                        label="No tile on this tab offers a field of this filter"
                        disabled={!isDisabled}
                    >
                        <Box>
                            <Checkbox
                                size="xs"
                                aria-label={`Filter every tile on ${tab.name}`}
                                checked={isOn}
                                indeterminate={state.checked === 'some'}
                                disabled={isDisabled}
                                label={
                                    <Group gap="xs" wrap="nowrap">
                                        <Text inherit truncate>
                                            {tab.name}
                                        </Text>
                                        <Text
                                            inherit
                                            c="dimmed"
                                            flex="0 0 auto"
                                        >
                                            {`${count.applied} of ${count.total} tiles`}
                                        </Text>
                                    </Group>
                                }
                                onChange={() =>
                                    updateFilter(
                                        setTabTargets(
                                            rule,
                                            tab.uuid,
                                            !isOn,
                                            dashboardTiles ?? [],
                                            fieldsByTile,
                                            sqlColumnsByTile,
                                        ),
                                    )
                                }
                            />
                        </Box>
                    </Tooltip>
                );
            })}
        </Stack>
    );
};
