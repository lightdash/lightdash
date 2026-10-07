import {
    FilterType,
    getItemId,
    type DashboardFilterableField,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Menu,
    Stack,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useCallback, useId, useMemo, useRef, useState, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { EditorShell } from './EditorShell';
import { getFieldDisplayLabel } from './fieldGrains';
import {
    FIELD_KINDS,
    type FieldKind,
    type PickableParameter,
} from './fieldKinds';
import { FieldPicker } from './FieldPicker';
import { FieldsAndCharts } from './FieldsAndCharts';
import classes from './FilterSidebar.module.css';
import { Interactivity } from './Interactivity';
import {
    getFreeParameterKeys,
    getParameterKind,
    getParameterLabel,
    type ParameterKind,
} from './parameterControls';
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
        parameterControls,
        addControl,
    } = useFilterSidebar();
    const [chosen, setChosen] = useState<DashboardFilterableField[]>([]);
    const [chosenParameterKeys, setChosenParameterKeys] = useState<string[]>(
        [],
    );
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
        <Menu.Item color="red" onClick={handleRemoveClick}>
            {removeArmed ? 'Click again to remove' : 'Remove filter'}
        </Menu.Item>
    );
    // Fields and parameters are exclusive: ticking one kind clears the other
    const toggleChosen = useCallback((field: DashboardFilterableField) => {
        const id = getItemId(field);
        setChosenParameterKeys([]);
        setChosen((current) =>
            current.some((item) => getItemId(item) === id)
                ? current.filter((item) => getItemId(item) !== id)
                : [...current, field],
        );
    }, []);
    const toggleChosenParameter = useCallback((key: string) => {
        setChosen([]);
        setChosenParameterKeys((current) =>
            current.includes(key)
                ? current.filter((item) => item !== key)
                : [...current, key],
        );
    }, []);
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );
    // Parameters no control overrides yet, one row per key with its chart count
    const pickableParameters = useMemo<PickableParameter[]>(() => {
        const kinds = (kind === null ? FIELD_KINDS : [kind]).filter(
            (item): item is ParameterKind => item !== FilterType.BOOLEAN,
        );
        return kinds.flatMap((parameterKind) =>
            getFreeParameterKeys(
                parameterKind,
                parameterControls,
                parameterDefinitions,
                tileParameterReferences,
            ).map((key) => ({
                key,
                label: getParameterLabel(key, parameterDefinitions),
                kind: parameterKind,
                chartCount: Object.values(tileParameterReferences).filter(
                    (keys) => keys.includes(key),
                ).length,
            })),
        );
    }, [
        kind,
        parameterControls,
        parameterDefinitions,
        tileParameterReferences,
    ]);
    // The first chosen field starts the filter; the rest are listed at 0 charts.
    // Chosen parameters become one control of their kind instead.
    const handleContinue = useCallback(() => {
        if (chosenParameterKeys.length > 0) {
            const [firstKey] = chosenParameterKeys;
            const definition =
                firstKey === undefined
                    ? undefined
                    : parameterDefinitions[firstKey];
            if (definition === undefined) return;
            addControl({
                id: uuidv4(),
                label: '',
                kind: getParameterKind(definition),
                parameterKeys: chosenParameterKeys,
                tileTargets: {},
            });
            setChosenParameterKeys([]);
            setKind(null);
            return;
        }
        const [first, ...rest] = chosen;
        if (first === undefined) return;
        addFirstField(first);
        rest.forEach((field) => listFieldId(getItemId(field)));
        setKind(null);
    }, [
        chosen,
        chosenParameterKeys,
        parameterDefinitions,
        addControl,
        addFirstField,
        listFieldId,
    ]);
    // Chosen fields survive Back to the picker; they clear on apply or cancel
    const handleCancel = useCallback(() => {
        setChosen([]);
        setChosenParameterKeys([]);
        setKind(null);
        cancel();
    }, [cancel]);
    const handleApply = useCallback(() => {
        setChosen([]);
        setChosenParameterKeys([]);
        setKind(null);
        apply();
    }, [apply]);
    const chosenCount = chosen.length + chosenParameterKeys.length;
    const chosenStatus =
        chosenParameterKeys.length > 0
            ? `${chosenParameterKeys.length} ${chosenParameterKeys.length === 1 ? 'parameter' : 'parameters'} chosen`
            : chosen.length === 0
              ? 'Pick one or more fields'
              : `${chosen.length} ${chosen.length === 1 ? 'field' : 'fields'} chosen`;
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
                        parameters={pickableParameters}
                        chosenParameterKeys={chosenParameterKeys}
                        onToggleParameter={toggleChosenParameter}
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
                            disabled={chosenCount === 0}
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
                        parameters={[]}
                        chosenParameterKeys={[]}
                        onToggleParameter={toggleChosenParameter}
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
        <EditorShell
            title={title}
            subtitle={landingCue}
            onBack={isNew ? backToPicker : undefined}
            menu={isNew ? null : moreActions}
            onMenuClose={() => setRemoveArmed(false)}
            onCancel={handleCancel}
            tabs={[
                {
                    value: 'interactivity',
                    label: 'Interactivity',
                    changed: isInteractivityChanged(
                        filterRule,
                        getSessionSettings(filterRule.id),
                    ),
                },
                {
                    value: 'fields',
                    label: 'Fields and charts',
                    count: fieldCount,
                },
            ]}
            activeTab={activeSection}
            onTabChange={(value) => {
                if (value === 'fields' || value === 'interactivity')
                    setActiveSection(value);
            }}
            footerStatus={footerStatus}
            primaryLabel="Apply"
            primaryDisabled={!canApply}
            primaryTooltip={blocker ?? 'Apply'}
            onPrimary={handleApply}
            onPrimaryBlocked={() => {
                setAttemptedApply(true);
                showLabelError();
            }}
            aboveTabs={
                <>
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
                </>
            }
        >
            {activeSection === 'fields' ? (
                <FieldsAndCharts />
            ) : (
                <Interactivity
                    filterRule={filterRule}
                    field={field}
                    attemptedApply={attemptedApply}
                    onChange={updateFilter}
                />
            )}
        </EditorShell>
    );
};
