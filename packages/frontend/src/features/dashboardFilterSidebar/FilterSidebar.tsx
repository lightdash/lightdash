import { getItemId, type DashboardFilterableField } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Menu,
    Stack,
    Tabs,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconChevronLeft, IconDots, IconX } from '@tabler/icons-react';
import { useCallback, useId, useMemo, useRef, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { getFieldDisplayLabel } from './fieldGrains';
import { type FieldKind } from './fieldKinds';
import { FieldPicker } from './FieldPicker';
import { FieldsAndCharts } from './FieldsAndCharts';
import classes from './FilterSidebar.module.css';
import { Interactivity } from './Interactivity';
import {
    getFilterFields,
    getTabCounts,
    getTileField,
    isTileFilterable,
} from './peers';
import { isInteractivityChanged } from './sessionSettings';
import { findFilterRule, isDefaultValueIncomplete } from './sidebarState';
import { useFilterSidebar } from './useFilterSidebar';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

const LABEL_ERROR = 'Add a label so viewers know what this filters';

export const FilterSidebar: FC = () => {
    const {
        editing,
        isNew,
        isEmpty,
        originalFilterRule,
        addFirstField,
        listFieldId,
        listedFieldIds,
        removeFilter,
        getSessionSettings,
        activeSection,
        setActiveSection,
        updateFilter,
        cancel,
        apply,
        backToPicker,
        isDirty,
    } = useFilterSidebar();
    const [chosen, setChosen] = useState<DashboardFilterableField[]>([]);
    const [kind, setKind] = useState<FieldKind | null>(null);
    const [removeArmed, setRemoveArmed] = useState(false);
    const [labelError, setLabelError] = useState(false);
    const [labelTouched, setLabelTouched] = useState(false);
    const [attemptedApply, setAttemptedApply] = useState(false);
    const labelInputRef = useRef<HTMLInputElement>(null);
    const labelErrorId = useId();
    const handleRemoveClick = useCallback(() => {
        if (removeArmed) {
            setRemoveArmed(false);
            removeFilter();
            return;
        }
        setRemoveArmed(true);
    }, [removeArmed, removeFilter]);
    const moreActions = (
        <Menu
            position="bottom-end"
            closeOnItemClick={false}
            onClose={() => setRemoveArmed(false)}
        >
            <Menu.Target>
                <Tooltip label="More actions">
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label="More actions"
                    >
                        <MantineIcon icon={IconDots} />
                    </ActionIcon>
                </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Item color="red" onClick={handleRemoveClick}>
                    {removeArmed ? 'Click again to remove' : 'Remove filter'}
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
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
        setKind(null);
    }, [chosen, addFirstField, listFieldId]);
    // Chosen fields survive Back to the picker; they clear on apply or cancel
    const handleCancel = useCallback(() => {
        setChosen([]);
        setKind(null);
        cancel();
    }, [cancel]);
    const handleApply = useCallback(() => {
        setChosen([]);
        setKind(null);
        apply();
    }, [apply]);
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
    const sqlColumnsByTile = useSqlColumnsByTile(filterRule);

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
                isTileFilterable(
                    tile,
                    filterableFieldsByTileUuid,
                    sqlColumnsByTile,
                ),
            );
            const applied = filterable.filter(
                (tile) =>
                    getTileField(
                        filterRule,
                        tile,
                        filterableFieldsByTileUuid,
                        sqlColumnsByTile,
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
                sqlColumnsByTile,
            ),
        );
        return {
            applied: counts.reduce((sum, count) => sum + count.applied, 0),
            total: counts.reduce((sum, count) => sum + count.total, 0),
            tabCount: counts.filter((count) => count.applied > 0).length,
        };
    }, [
        filterRule,
        dashboardTiles,
        dashboardTabs,
        filterableFieldsByTileUuid,
        sqlColumnsByTile,
    ]);

    if (editing === null) return null;

    if (isNew && filterRule === null) {
        return (
            <Box className={classes.root}>
                <Group justify="space-between" wrap="nowrap" px="md" pt="md">
                    <Title order={5} className={classes.title}>
                        New filter
                    </Title>
                    <Tooltip label="Cancel">
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label="Cancel"
                            onClick={handleCancel}
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
                        <Button variant="default" onClick={handleCancel}>
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
                    <Group gap={4} wrap="nowrap">
                        {moreActions}
                        <Tooltip label="Cancel">
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                aria-label="Cancel"
                                onClick={handleCancel}
                            >
                                <MantineIcon icon={IconX} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                </Group>
                <Stack gap="md" p="md" className={classes.body}>
                    <Text fw={600} fz="sm">
                        Pick fields
                    </Text>
                    <FieldPicker
                        mode="single"
                        fields={allFilterableFields ?? []}
                        getChartCount={getNewFieldChartCount}
                        chosen={[]}
                        onToggle={addFirstField}
                        kind={kind}
                        onKindChange={setKind}
                    />
                </Stack>
                <Stack gap="xs" p="md" className={classes.footer}>
                    <Text fz="xs" c="dimmed">
                        Pick a field
                    </Text>
                    <Group justify="flex-end" gap="xs">
                        <Button variant="default" onClick={handleCancel}>
                            Cancel
                        </Button>
                        <Button disabled>Apply</Button>
                    </Group>
                </Stack>
            </Box>
        );
    }

    if (filterRule === null || reach === null) return null;

    const field = allFilterableFieldsMap[filterRule.target.fieldId] ?? null;
    const fieldLabel = field
        ? getFieldDisplayLabel(field, allFilterableFields ?? [])
        : null;
    const hasLabel = (filterRule.label ?? '').trim() !== '';
    const title = isNew ? 'New filter' : filterRule.label || 'Filter';
    const isDefaultIncomplete = isDefaultValueIncomplete(filterRule);
    const canApply = (!isNew || hasLabel) && !isDefaultIncomplete;
    const blocker = !hasLabel
        ? 'Add a label to apply'
        : isDefaultIncomplete
          ? 'Choose a default value or turn it off'
          : null;
    const footerStatus = blocker ?? (isDirty ? 'Not applied yet' : null);
    const fieldCount = getFilterFields(filterRule, listedFieldIds).length;
    const tabReach =
        dashboardTabs.length > 1
            ? ` on ${reach.tabCount} of ${dashboardTabs.length} tabs`
            : '';
    const landingCue = `${fieldCount} ${fieldCount === 1 ? 'field' : 'fields'} · reaches ${reach.applied} of ${reach.total} ${reach.total === 1 ? 'chart' : 'charts'}${tabReach}`;
    const showLabelError = () => {
        setLabelError(true);
        labelInputRef.current?.focus();
    };

    return (
        <Box className={classes.root}>
            <Group justify="space-between" wrap="nowrap" px="md" pt="md">
                <Stack gap={2} align="flex-start">
                    {isNew && (
                        <Button
                            variant="subtle"
                            size="compact-xs"
                            leftSection={<MantineIcon icon={IconChevronLeft} />}
                            onClick={backToPicker}
                        >
                            Back
                        </Button>
                    )}
                    <Title order={5} className={classes.title}>
                        {title}
                    </Title>
                    <Text fz="xs" c="dimmed">
                        {landingCue}
                    </Text>
                </Stack>
                <Group gap={4} wrap="nowrap">
                    {!isNew && moreActions}
                    <Tooltip label="Cancel">
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label="Cancel"
                            onClick={handleCancel}
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </Group>

            <Stack gap="md" p="md" className={classes.body}>
                <TextInput
                    ref={labelInputRef}
                    label="Filter label"
                    withAsterisk
                    required
                    aria-required
                    aria-describedby={labelError ? labelErrorId : undefined}
                    error={labelError ? LABEL_ERROR : undefined}
                    errorProps={{ id: labelErrorId }}
                    placeholder="What viewers will see"
                    value={filterRule.label ?? ''}
                    onChange={(event) => {
                        if (event.currentTarget.value.trim() !== '') {
                            setLabelError(false);
                        }
                        setLabelTouched(true);
                        updateFilter({
                            ...filterRule,
                            label: event.currentTarget.value || undefined,
                        });
                    }}
                    onBlur={() => {
                        if (labelTouched && !hasLabel) setLabelError(true);
                    }}
                    onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        if (canApply) handleApply();
                        else showLabelError();
                    }}
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
                                        className={classes.changedDot}
                                    />
                                ) : null
                            }
                        >
                            Interactivity
                        </Tabs.Tab>
                        <Tabs.Tab
                            value="fields"
                            rightSection={
                                <Tooltip
                                    label={`${fieldCount} ${fieldCount === 1 ? 'field' : 'fields'}`}
                                >
                                    <Text fz="xs" c="dimmed" span>
                                        ({fieldCount})
                                    </Text>
                                </Tooltip>
                            }
                        >
                            Fields and charts
                        </Tabs.Tab>
                    </Tabs.List>
                    <Tabs.Panel value="fields">
                        <FieldsAndCharts />
                    </Tabs.Panel>
                    <Tabs.Panel value="interactivity">
                        <Interactivity
                            filterRule={filterRule}
                            field={field}
                            attemptedApply={attemptedApply}
                            onChange={updateFilter}
                        />
                    </Tabs.Panel>
                </Tabs>
            </Stack>

            <Stack gap="xs" p="md" className={classes.footer}>
                {footerStatus !== null && (
                    <Text fz="xs" c="dimmed">
                        {footerStatus}
                    </Text>
                )}
                <Group justify="flex-end" gap="xs">
                    <Button variant="default" onClick={handleCancel}>
                        Cancel
                    </Button>
                    {!canApply ? (
                        <Tooltip label={blocker ?? 'Apply'}>
                            <Box
                                onClick={() => {
                                    setAttemptedApply(true);
                                    showLabelError();
                                }}
                            >
                                <Button disabled>Apply</Button>
                            </Box>
                        </Tooltip>
                    ) : (
                        <Button onClick={handleApply}>Apply</Button>
                    )}
                </Group>
            </Stack>
        </Box>
    );
};
