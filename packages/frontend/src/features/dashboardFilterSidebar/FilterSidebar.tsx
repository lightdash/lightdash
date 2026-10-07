import { getItemId, type DashboardFilterableField } from '@lightdash/common';
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
import { useCallback, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { type FieldKind } from './fieldKinds';
import { FieldPicker } from './FieldPicker';
import { FieldsAndCharts } from './FieldsAndCharts';
import classes from './FilterSidebar.module.css';
import { Interactivity } from './Interactivity';
import { getTabCounts, getTileField, isTileFilterable } from './peers';
import { isInteractivityChanged } from './sessionSettings';
import { findFilterRule } from './sidebarState';
import { useFilterSidebar } from './useFilterSidebar';

export const FilterSidebar: FC = () => {
    const {
        editing,
        isNew,
        isEmpty,
        originalFilterRule,
        addFirstField,
        listFieldId,
        removeFilter,
        getSessionSettings,
        activeSection,
        setActiveSection,
        updateFilter,
        cancel,
        apply,
        isDirty,
    } = useFilterSidebar();
    const [chosen, setChosen] = useState<DashboardFilterableField[]>([]);
    const [kind, setKind] = useState<FieldKind | null>(null);
    const toggleChosen = useCallback((field: DashboardFilterableField) => {
        const id = getItemId(field);
        setChosen((current) =>
            current.some((item) => getItemId(item) === id)
                ? current.filter((item) => getItemId(item) !== id)
                : [...current, field],
        );
    }, []);
    // The first chosen field starts the filter; the rest are listed at 0 charts
    const handleContinue = useCallback(() => {
        const [first, ...rest] = chosen;
        if (first === undefined) return;
        addFirstField(first);
        rest.forEach((field) => listFieldId(getItemId(field)));
        setChosen([]);
        setKind(null);
    }, [chosen, addFirstField, listFieldId]);
    const chosenStatus =
        chosen.length === 0
            ? 'Pick one or more fields'
            : `${chosen.length} ${chosen.length === 1 ? 'field' : 'fields'} chosen`;
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );

    const allFilterableFields = useDashboardContext(
        (c) => c.allFilterableFields,
    );

    const editingFilterId = editing?.filterId ?? null;
    const filterRule =
        editingFilterId === null
            ? null
            : findFilterRule(dashboardFilters, editingFilterId);

    const getNewFieldChartCount = useCallback(
        (candidate: DashboardFilterableField) => {
            const candidateId = getItemId(candidate);
            const chartCount = Object.values(
                filterableFieldsByTileUuid ?? {},
            ).filter((tileFields) =>
                tileFields.some(
                    (tileField) => getItemId(tileField) === candidateId,
                ),
            ).length;
            return chartCount;
        },
        [filterableFieldsByTileUuid],
    );

    const reach = useMemo(() => {
        if (filterRule === null) return null;
        const tiles = dashboardTiles ?? [];
        if (dashboardTabs.length === 0) {
            const filterable = tiles.filter((tile) =>
                isTileFilterable(tile, filterableFieldsByTileUuid),
            );
            const applied = filterable.filter(
                (tile) =>
                    getTileField(
                        filterRule,
                        tile,
                        filterableFieldsByTileUuid,
                    ) !== null,
            ).length;
            return {
                applied,
                total: filterable.length,
                tabCount: applied > 0 ? 1 : 0,
            };
        }
        const counts = Object.values(
            getTabCounts(
                filterRule,
                tiles,
                dashboardTabs,
                filterableFieldsByTileUuid,
            ),
        );
        return {
            applied: counts.reduce((sum, count) => sum + count.applied, 0),
            total: counts.reduce((sum, count) => sum + count.total, 0),
            tabCount: counts.filter((count) => count.applied > 0).length,
        };
    }, [filterRule, dashboardTiles, dashboardTabs, filterableFieldsByTileUuid]);

    if (editing === null) return null;

    if (isNew && filterRule === null) {
        return (
            <Box className={classes.root}>
                <Group justify="space-between" wrap="nowrap" px="md" pt="md">
                    <Title order={5} className={classes.title}>
                        New filter
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
                    <Text fw={600} fz="sm">
                        Pick fields
                    </Text>
                    <FieldPicker
                        mode="multi"
                        fields={allFilterableFields ?? []}
                        getChartCount={getNewFieldChartCount}
                        chosen={chosen}
                        onToggle={toggleChosen}
                        kind={kind}
                        onKindChange={setKind}
                    />
                </Stack>
                <Stack gap="xs" p="md" className={classes.footer}>
                    <Text fz="xs" c="dimmed">
                        {chosenStatus}
                    </Text>
                    <Group justify="flex-end" gap="xs">
                        <Button variant="default" onClick={cancel}>
                            Cancel
                        </Button>
                        <Button
                            disabled={chosen.length === 0}
                            onClick={handleContinue}
                        >
                            Continue
                        </Button>
                    </Group>
                </Stack>
            </Box>
        );
    }

    // Every field was removed: same picker as a new filter, identity kept
    if (isEmpty) {
        return (
            <Box className={classes.root}>
                <Group justify="space-between" wrap="nowrap" px="md" pt="md">
                    <Title order={5} className={classes.title}>
                        {originalFilterRule?.label ?? 'Filter'}
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
                    <Text fw={600} fz="sm">
                        Pick fields
                    </Text>
                    <FieldPicker
                        mode="multi"
                        fields={allFilterableFields ?? []}
                        getChartCount={getNewFieldChartCount}
                        chosen={chosen}
                        onToggle={toggleChosen}
                        kind={kind}
                        onKindChange={setKind}
                    />
                </Stack>
                <Stack gap="xs" p="md" className={classes.footer}>
                    <Text fz="xs" c="dimmed">
                        {chosenStatus}
                    </Text>
                    <Group justify="space-between" gap="xs">
                        <Button
                            variant="subtle"
                            color="red"
                            onClick={removeFilter}
                        >
                            Remove filter
                        </Button>
                        <Group gap="xs">
                            <Button variant="default" onClick={cancel}>
                                Cancel
                            </Button>
                            <Button
                                disabled={chosen.length === 0}
                                onClick={handleContinue}
                            >
                                Continue
                            </Button>
                        </Group>
                    </Group>
                </Stack>
            </Box>
        );
    }

    if (filterRule === null || reach === null) return null;

    const field = allFilterableFieldsMap[filterRule.target.fieldId] ?? null;
    const fieldLabel = field?.label ?? null;
    const hasLabel = (filterRule.label ?? '').trim() !== '';
    const statusName = filterRule.label || fieldLabel || 'Filter';
    const title = isNew ? 'New filter' : statusName;
    const statusSuffix = isNew
        ? hasLabel
            ? ''
            : '. Add a label to finish'
        : isDirty
          ? '. Not applied yet'
          : '';

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
                {isNew && fieldLabel !== null && (
                    <Group gap="xs">
                        <Text fz="xs" c="dimmed">
                            Suggestions
                        </Text>
                        <Button
                            size="compact-xs"
                            variant="default"
                            radius="xl"
                            onClick={() =>
                                updateFilter({
                                    ...filterRule,
                                    label: fieldLabel,
                                })
                            }
                        >
                            {fieldLabel}
                        </Button>
                    </Group>
                )}
                <Tabs
                    value={activeSection}
                    onChange={(value) => {
                        if (value === 'fields' || value === 'interactivity')
                            setActiveSection(value);
                    }}
                >
                    <Tabs.List mb="md">
                        <Tabs.Tab value="fields">Fields and charts</Tabs.Tab>
                        <Tabs.Tab
                            value="interactivity"
                            rightSection={
                                filterRule &&
                                isInteractivityChanged(
                                    filterRule,
                                    getSessionSettings(filterRule.id),
                                ) ? (
                                    <Box
                                        role="img"
                                        aria-label="Changed from the default"
                                        w={6}
                                        h={6}
                                        bg="blue.6"
                                        style={{ borderRadius: '50%' }}
                                    />
                                ) : null
                            }
                        >
                            Interactivity
                        </Tabs.Tab>
                    </Tabs.List>
                    <Tabs.Panel value="fields">
                        <FieldsAndCharts />
                    </Tabs.Panel>
                    <Tabs.Panel value="interactivity">
                        <Interactivity
                            filterRule={filterRule}
                            field={field}
                            onChange={updateFilter}
                        />
                    </Tabs.Panel>
                </Tabs>
            </Stack>

            <Stack gap="xs" p="md" className={classes.footer}>
                <Text fz="xs" c="dimmed">
                    {statusName} filters {reach.applied} of {reach.total} charts
                    on {reach.tabCount} {reach.tabCount === 1 ? 'tab' : 'tabs'}
                    {statusSuffix}
                </Text>
                <Group justify="space-between" gap="xs">
                    {isNew ? (
                        <span />
                    ) : (
                        <Button
                            variant="default"
                            c="red"
                            onClick={removeFilter}
                        >
                            Remove filter
                        </Button>
                    )}
                    <Group gap="xs">
                        <Button variant="default" onClick={cancel}>
                            Cancel
                        </Button>
                        <Button onClick={apply} disabled={isNew && !hasLabel}>
                            {isNew ? 'Add filter' : 'Apply'}
                        </Button>
                    </Group>
                </Group>
            </Stack>
        </Box>
    );
};
