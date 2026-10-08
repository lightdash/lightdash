import { Button, Group, Menu, Text, TextInput } from '@mantine/core';
import { useCallback, useId, useMemo, useRef, useState, type FC } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { EditorShell } from './EditorShell';
import { getFieldDisplayLabel } from './fieldGrains';
import { FieldsAndTiles } from './FieldsAndTiles';
import { FilterSettings } from './FilterSettings';
import { ParameterSidebar } from './ParameterSidebar';
import {
    getFilterFields,
    getTabCounts,
    getTileField,
    isTileFilterable,
} from './peers';
import { isDefaultValueIncomplete } from './sidebarState';
import { useControlsSidebar } from './useControlsSidebar';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

const LABEL_ERROR = 'Add a label so viewers know what this filters';

export const ControlSidebar: FC = () => {
    const {
        editing,
        editingControl,
        isNew,
        isPlaceholder,
        editingRule,
        removeFilter,
        activeSection,
        setActiveSection,
        updateFilter,
        cancel,
        apply,
        isDirty,
    } = useControlsSidebar();
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
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );

    const allFilterableFields = useDashboardContext(
        (c) => c.allFilterableFields,
    );

    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const sqlColumnsByTile = useSqlColumnsByTile(editingRule);

    const reach = useMemo(() => {
        if (editingRule === null) return null;
        const tiles = dashboardTiles ?? [];
        if (dashboardTabs.length === 0) {
            const applied = tiles.filter(
                (tile) =>
                    isTileFilterable(
                        tile,
                        filterableFieldsByTileUuid,
                        sqlColumnsByTile,
                    ) &&
                    getTileField(
                        editingRule,
                        tile,
                        filterableFieldsByTileUuid,
                        sqlColumnsByTile,
                    ) !== null,
            ).length;
            return { applied, total: tiles.length, tabCount: 0 };
        }
        const counts = Object.values(
            getTabCounts(
                editingRule,
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
        editingRule,
        dashboardTiles,
        dashboardTabs,
        filterableFieldsByTileUuid,
        sqlColumnsByTile,
    ]);

    if (editingControl !== null) return <ParameterSidebar />;
    if (editing === null || editingRule === null || reach === null) return null;
    const filterRule = editingRule;

    const field = allFilterableFieldsMap[filterRule.target.fieldId] ?? null;
    const fieldLabel = field
        ? getFieldDisplayLabel(field, allFilterableFields ?? [])
        : null;
    const hasLabel = (filterRule.label ?? '').trim() !== '';
    const title = isNew
        ? isPlaceholder
            ? 'New control'
            : 'New filter'
        : filterRule.label || 'Filter';
    const needsLabel = isNew && !hasLabel;
    const blocker = isPlaceholder
        ? 'Add a field to apply'
        : needsLabel
          ? 'Add a label to apply'
          : isDefaultValueIncomplete(filterRule)
            ? 'Choose a default value or turn it off'
            : null;
    const canApply = blocker === null;
    const footerStatus = blocker ?? (isDirty ? 'Not applied yet' : null);
    const fieldCount = getFilterFields(filterRule).length;
    const tabReach =
        dashboardTabs.length > 1
            ? ` on ${reach.tabCount} of ${dashboardTabs.length} tabs`
            : '';
    const subtitle = isPlaceholder
        ? 'No mapping yet'
        : `${fieldCount} ${fieldCount === 1 ? 'field' : 'fields'} · reaches ${reach.applied} of ${reach.total} ${reach.total === 1 ? 'tile' : 'tiles'}${tabReach}`;
    const showSettings = activeSection === 'settings' && !isPlaceholder;
    const showLabelError = () => {
        setLabelError(true);
        labelInputRef.current?.focus();
    };

    return (
        <EditorShell
            title={title}
            subtitle={subtitle}
            menu={isNew ? null : moreActions}
            onMenuClose={() => setRemoveArmed(false)}
            onCancel={cancel}
            tabs={[
                {
                    value: 'fields',
                    label: 'Fields and tiles',
                    count: isPlaceholder ? 0 : fieldCount,
                },
                {
                    value: 'settings',
                    label: 'Settings',
                    disabled: isPlaceholder,
                    disabledReason: 'Pick a field first',
                },
            ]}
            activeTab={showSettings ? 'settings' : 'fields'}
            onTabChange={(value) => {
                if (value === 'fields' || value === 'settings')
                    setActiveSection(value);
            }}
            footerStatus={footerStatus}
            primaryLabel="Apply"
            primaryDisabled={!canApply}
            onPrimary={apply}
            aboveTabs={
                <>
                    <TextInput
                        ref={labelInputRef}
                        label={isPlaceholder ? 'Label' : 'Filter label'}
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
                            if (canApply) {
                                apply();
                                return;
                            }
                            setAttemptedApply(true);
                            if (!hasLabel) showLabelError();
                        }}
                    />
                    {isNew && !hasLabel && fieldLabel !== null && (
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
            {showSettings ? (
                <FilterSettings
                    rule={filterRule}
                    field={field}
                    attemptedApply={attemptedApply}
                    onChange={updateFilter}
                />
            ) : (
                <FieldsAndTiles />
            )}
        </EditorShell>
    );
};
