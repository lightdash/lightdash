import { type DashboardFilterRule } from '@lightdash/common';
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
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useLabelDraft } from './useLabelDraft';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

const LABEL_ERROR = 'Add a label so viewers know what this filters';

type FilterEditorProps = {
    rule: DashboardFilterRule;
};

// Mounted with the filter id as key, so the label draft and the armed and
// error states never carry over to another control
const FilterEditor: FC<FilterEditorProps> = ({ rule: filterRule }) => {
    const isNew = useControlsSidebarSelector((c) => c.isNew);
    const isPlaceholder = useControlsSidebarSelector((c) => c.isPlaceholder);
    const removeFilter = useControlsSidebarSelector((c) => c.removeFilter);
    const activeSection = useControlsSidebarSelector((c) => c.activeSection);
    const setActiveSection = useControlsSidebarSelector(
        (c) => c.setActiveSection,
    );
    const updateFilter = useControlsSidebarSelector((c) => c.updateFilter);
    const discard = useControlsSidebarSelector((c) => c.discard);
    const close = useControlsSidebarSelector((c) => c.close);
    const isDirty = useControlsSidebarSelector((c) => c.isDirty);
    const label = useLabelDraft(filterRule.label ?? '', (next) =>
        updateFilter({ ...filterRule, label: next || undefined }),
    );
    const [removeArmed, setRemoveArmed] = useState(false);
    const [labelError, setLabelError] = useState(false);
    const [labelTouched, setLabelTouched] = useState(false);
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
    const sqlColumnsByTile = useSqlColumnsByTile(filterRule);

    const reach = useMemo(() => {
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
                        filterRule,
                        tile,
                        filterableFieldsByTileUuid,
                        sqlColumnsByTile,
                    ) !== null,
            ).length;
            return { applied, total: tiles.length, tabCount: 0 };
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
    // No props, so one element: typing a label does not re-render the list
    const fieldsAndTiles = useMemo(() => <FieldsAndTiles />, []);

    const field = allFilterableFieldsMap[filterRule.target.fieldId] ?? null;
    const fieldLabel = field
        ? getFieldDisplayLabel(field, allFilterableFields ?? [])
        : null;
    const hasLabel = label.draft.trim() !== '';
    const title = isNew
        ? isPlaceholder
            ? 'New control'
            : 'New filter'
        : label.draft || 'Filter';
    const needsLabel = isNew && !hasLabel;
    // Closing keeps the edits, so the footer says what closing would drop
    const footerStatus = isPlaceholder
        ? isNew
            ? 'Add a field to keep this control'
            : 'Add a field to keep these changes'
        : needsLabel
          ? 'Add a label to keep this control'
          : isDefaultValueIncomplete(filterRule)
            ? 'No default value chosen, so the default stays off'
            : null;
    const discardLabel = isNew
        ? 'Discard control'
        : isDirty
          ? 'Discard changes'
          : null;
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
            onClose={close}
            discardLabel={discardLabel}
            onDiscard={discard}
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
                        value={label.draft}
                        onChange={(event) => {
                            if (event.currentTarget.value.trim() !== '') {
                                setLabelError(false);
                            }
                            setLabelTouched(true);
                            label.type(event.currentTarget.value);
                        }}
                        onBlur={() => {
                            // Synchronous, so a click on Done closes with the label
                            label.flush();
                            if (labelTouched && !hasLabel) setLabelError(true);
                        }}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            label.flush();
                            if (needsLabel) showLabelError();
                            else if (!isPlaceholder) close();
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
                                onClick={() => {
                                    setLabelError(false);
                                    label.set(fieldLabel);
                                }}
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
                    onChange={updateFilter}
                />
            ) : (
                fieldsAndTiles
            )}
        </EditorShell>
    );
};

export const ControlSidebar: FC = () => {
    const filterId = useControlsSidebarSelector(
        (c) => c.editing?.filterId ?? null,
    );
    const editingRule = useControlsSidebarSelector((c) => c.editingRule);
    const isEditingControl = useControlsSidebarSelector(
        (c) => c.editingControl !== null,
    );
    if (isEditingControl) return <ParameterSidebar />;
    if (filterId === null || editingRule === null) return null;
    return <FilterEditor key={filterId} rule={editingRule} />;
};
