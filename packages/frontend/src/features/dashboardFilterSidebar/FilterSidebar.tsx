import { FilterType, getFilterTypeFromItem } from '@lightdash/common';
import { Button, Group, Menu, Text, TextInput } from '@mantine/core';
import { useCallback, useId, useMemo, useRef, useState, type FC } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { EditorShell } from './EditorShell';
import { getFieldDisplayLabel } from './fieldGrains';
import { FieldsAndCharts } from './FieldsAndCharts';
import { Interactivity } from './Interactivity';
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
        editingRule,
        listedFieldIds,
        removeFilter,
        getSessionSettings,
        activeSection,
        setActiveSection,
        updateFilter,
        cancel,
        apply,
        isDirty,
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
                total: tiles.length,
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

    if (filterRule === null || reach === null) return null;

    const field = allFilterableFieldsMap[filterRule.target.fieldId] ?? null;
    const fieldLabel = field
        ? getFieldDisplayLabel(field, allFilterableFields ?? [])
        : null;
    const hasLabel = (filterRule.label ?? '').trim() !== '';
    const title = isNew
        ? isUnplaced
            ? 'New control'
            : 'New filter'
        : filterRule.label || 'Filter';
    // A filter with no field is a placeholder: it cannot be applied
    const isDefaultIncomplete =
        !isUnplaced && isDefaultValueIncomplete(filterRule);
    const canApply =
        (!isNew || hasLabel) && !isUnplaced && !isDefaultIncomplete;
    const blocker = isUnplaced
        ? 'Add a field to apply'
        : !hasLabel
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
        ? `No mappings yet · reaches 0 of ${reach.total} tiles`
        : `${fieldCount} ${fieldCount === 1 ? 'field' : 'fields'} · reaches ${reach.applied} of ${reach.total} ${reach.total === 1 ? 'tile' : 'tiles'}${tabReach}`;
    const showLabelError = () => {
        setLabelError(true);
        labelInputRef.current?.focus();
    };

    return (
        <EditorShell
            title={title}
            subtitle={landingCue}
            menu={isNew ? null : moreActions}
            onMenuClose={() => setRemoveArmed(false)}
            onCancel={cancel}
            tabs={[
                {
                    value: 'fields',
                    label: 'Fields and tiles',
                    count: fieldCount,
                },
                {
                    value: 'interactivity',
                    label: 'Settings',
                    disabled: isUnplaced,
                    disabledReason: 'Pick a field first',
                    changed: isInteractivityChanged(
                        filterRule,
                        getSessionSettings(filterRule.id),
                    ),
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
                        label={isUnplaced ? 'Label' : 'Filter label'}
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
                        field ? getFilterTypeFromItem(field) : FilterType.STRING
                    }
                    attemptedApply={attemptedApply}
                    onChange={updateFilter}
                />
            )}
        </EditorShell>
    );
};
