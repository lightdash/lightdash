import {
    ActionIcon,
    Box,
    Button,
    Group,
    Stack,
    Tabs,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { FieldsAndCharts } from './FieldsAndCharts';
import classes from './FilterSidebar.module.css';
import { Interactivity } from './Interactivity';
import { findFilterRule, getFilterReach } from './sidebarState';
import { useFilterSidebar } from './useFilterSidebar';

export const FilterSidebar: FC = () => {
    const {
        editing,
        originalFilterRule,
        activeSection,
        setActiveSection,
        updateFilter,
        cancel,
        apply,
        isDirty,
    } = useFilterSidebar();
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );

    const filterRule =
        editing === null
            ? null
            : findFilterRule(dashboardFilters, editing.filterId);

    const reach = useMemo(
        () =>
            filterRule === null
                ? null
                : getFilterReach(
                      filterRule,
                      dashboardTiles ?? [],
                      dashboardTabs,
                      filterableFieldsByTileUuid,
                  ),
        [filterRule, dashboardTiles, dashboardTabs, filterableFieldsByTileUuid],
    );

    if (filterRule === null || reach === null) return null;

    const field = allFilterableFieldsMap[filterRule.target.fieldId] ?? null;
    const title = filterRule.label || field?.label || 'Filter';

    return (
        <Box className={classes.root}>
            <Group justify="space-between" wrap="nowrap" px="md" pt="md">
                <Title order={5} className={classes.title}>
                    {title}
                </Title>
                <Tooltip label="Close">
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label="Close"
                        onClick={cancel}
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Tooltip>
            </Group>

            <Stack gap="md" p="md" className={classes.body}>
                <TextInput
                    label="Filter label"
                    placeholder="What viewers will see"
                    value={filterRule.label ?? ''}
                    onChange={(event) =>
                        updateFilter({
                            ...filterRule,
                            label: event.currentTarget.value || undefined,
                        })
                    }
                />
                <Tabs
                    value={activeSection}
                    onChange={(value) => {
                        if (value === 'fields' || value === 'interactivity')
                            setActiveSection(value);
                    }}
                >
                    <Tabs.List mb="md">
                        <Tabs.Tab value="fields">Fields and charts</Tabs.Tab>
                        <Tabs.Tab value="interactivity">Interactivity</Tabs.Tab>
                    </Tabs.List>
                    <Tabs.Panel value="fields">
                        <FieldsAndCharts reach={reach} />
                    </Tabs.Panel>
                    <Tabs.Panel value="interactivity">
                        <Interactivity
                            filterRule={filterRule}
                            originalFilterRule={originalFilterRule}
                            field={field}
                            onChange={updateFilter}
                        />
                    </Tabs.Panel>
                </Tabs>
            </Stack>

            <Stack gap="xs" p="md" className={classes.footer}>
                <Text fz="xs" c="dimmed">
                    {title} filters {reach.applied} of {reach.total} charts on{' '}
                    {reach.tabCount} {reach.tabCount === 1 ? 'tab' : 'tabs'}
                    {isDirty ? '. Not applied yet' : ''}
                </Text>
                <Group justify="flex-end" gap="xs">
                    <Button variant="default" onClick={cancel}>
                        Cancel
                    </Button>
                    <Button onClick={apply}>Apply</Button>
                </Group>
            </Stack>
        </Box>
    );
};
