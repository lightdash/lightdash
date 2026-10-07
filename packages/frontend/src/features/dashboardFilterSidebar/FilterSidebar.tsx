import {
    FilterType,
    getFilterTypeFromItem,
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
import { FIELD_KINDS, type PickableParameter } from './fieldKinds';
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
import { isDefaultValueIncomplete } from './sidebarState';
import { useFilterSidebar } from './useFilterSidebar';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

const LABEL_ERROR = 'Add a label so viewers know what this filters';

export const FilterSidebar: FC = () => {
    const {
        editing,
        isNew,
        isUnplaced,
        unplacedKind,
        editingRule,
        addFirstField,
        openKind,
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
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );
    // Parameters no control overrides yet, one row per key with its chart count
    const pickableParameters = useMemo<PickableParameter[]>(() => {
        const kinds = FIELD_KINDS.filter(
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
    }, [parameterControls, parameterDefinitions, tileParameterReferences]);
    // A picked parameter becomes one control of its kind
    const handlePickParameter = useCallback(
        (key: string) => {
            const definition = parameterDefinitions[key];
            if (definition === undefined) return;
            addControl({
                id: uuidv4(),
                label: '',
                kind: getParameterKind(definition),
                parameterKeys: [key],
                tileTargets: {},
            });
        },
        [parameterDefinitions, addControl],
    );
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

    const filterRule = editingRule;
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
                            onClick={cancel}
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
                <Stack gap="md" p="md" className={classes.body}>
                    <FieldPicker
                        fields={allFilterableFields ?? []}
                        getChartCount={getNewFieldChartCount}
                        onPickKind={openKind}
                        onPickField={addFirstField}
                        parameters={pickableParameters}
                        onPickParameter={handlePickParameter}
                    />
                </Stack>
                <Group
                    justify="flex-end"
                    gap="xs"
                    p="md"
                    className={classes.footer}
                >
                    <Button variant="default" onClick={cancel}>
                        Cancel
                    </Button>
                </Group>
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
    const fieldCount = isUnplaced
        ? 0
        : getFilterFields(filterRule, listedFieldIds).length;
    const tabReach =
        dashboardTabs.length > 1
            ? ` on ${reach.tabCount} of ${dashboardTabs.length} tabs`
            : '';
    const landingCue = isUnplaced
        ? 'No fields yet · reaches 0 charts'
        : `${fieldCount} ${fieldCount === 1 ? 'field' : 'fields'} · reaches ${reach.applied} of ${reach.total} ${reach.total === 1 ? 'chart' : 'charts'}${tabReach}`;
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
            onCancel={cancel}
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
            onPrimary={apply}
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
                            if (canApply) apply();
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
                    kind={
                        field
                            ? getFilterTypeFromItem(field)
                            : (unplacedKind ?? FilterType.STRING)
                    }
                    attemptedApply={attemptedApply}
                    onChange={updateFilter}
                />
            )}
        </EditorShell>
    );
};
