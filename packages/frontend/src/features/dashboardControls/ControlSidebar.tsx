import { type DashboardFilterRule } from '@lightdash/common';
import { Button, Group, Menu, Text, TextInput } from '@mantine/core';
import { useCallback, useMemo, useState, type FC } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { EditorShell } from './EditorShell';
import { FieldsAndTiles } from './FieldsAndTiles';
import { FilterSettings } from './FilterSettings';
import {
    getFilterFields,
    getTabCounts,
    getTileField,
    canTileTakeFilter,
} from './peers';
import { isDefaultValueIncomplete, withFilterRuleLabel } from './sidebarState';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useFilterRuleField } from './useFilterRuleField';
import {
    focusLabelInput,
    useFocusLabelOnMount,
    useLabelDraft,
} from './useLabelDraft';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

type FilterEditorProps = {
    rule: DashboardFilterRule;
};

// Mounted with the filter id as key, so the label draft and the armed state
// never carry over to another control, and the label takes focus each time
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
    useFocusLabelOnMount();
    // As the control was opened: an emptied label goes back to exactly that
    const [hadLabelKey] = useState(() => 'label' in filterRule);
    const label = useLabelDraft(filterRule.label ?? '', (next) =>
        updateFilter(withFilterRuleLabel(filterRule, next, hadLabelKey)),
    );
    const [removeArmed, setRemoveArmed] = useState(false);
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
    const sqlColumnsByTile = useSqlColumnsByTile(filterRule);

    const reach = useMemo(() => {
        const tiles = dashboardTiles ?? [];
        if (dashboardTabs.length === 0) {
            const applied = tiles.filter(
                (tile) =>
                    canTileTakeFilter(
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

    // A dimension or a metric, as the shipped bar resolves it
    const field = useFilterRuleField(filterRule);
    const fieldLabel = field?.label ?? null;
    const hasLabel = label.draft.trim() !== '';
    // What the bar shows for a filter with no label: its field's name, or
    // the column's for a SQL column filter
    const fallbackName =
        field?.label ??
        (filterRule.target.isSqlColumn ? filterRule.target.fieldId : null);
    const title = isPlaceholder
        ? 'New control'
        : hasLabel
          ? label.draft
          : (fallbackName ?? 'Filter');
    // Closing keeps the edits, so the footer says what closing would drop
    const footerStatus = isPlaceholder
        ? 'Add a field to keep this control'
        : isDefaultValueIncomplete(filterRule)
          ? 'No default value chosen, so the default stays off'
          : null;
    const discardLabel = isNew
        ? 'Discard control'
        : isDirty
          ? 'Discard changes'
          : null;
    const fieldCount = getFilterFields(filterRule, dashboardTiles).length;
    const tabReach =
        dashboardTabs.length > 1
            ? ` on ${reach.tabCount} of ${dashboardTabs.length} tabs`
            : '';
    const subtitle = isPlaceholder
        ? 'No mapping yet'
        : `${fieldCount} ${fieldCount === 1 ? 'field' : 'fields'} · reaches ${reach.applied} of ${reach.total} ${reach.total === 1 ? 'tile' : 'tiles'}${tabReach}`;
    const showSettings = activeSection === 'settings' && !isPlaceholder;

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
                        label={isPlaceholder ? 'Label' : 'Filter label'}
                        // Left empty, the filter goes by its field's name
                        placeholder={fallbackName ?? 'What viewers will see'}
                        autoFocus
                        data-controls-label
                        value={label.draft}
                        onChange={(event) =>
                            label.type(event.currentTarget.value)
                        }
                        // Synchronous, so a click on Done closes with the label
                        onBlur={label.flush}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            label.flush();
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
                                // The chip leaves once clicked: the label
                                // input takes the focus it had
                                onClick={() => {
                                    label.set(fieldLabel);
                                    focusLabelInput();
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
    if (filterId === null || editingRule === null) return null;
    return <FilterEditor key={filterId} rule={editingRule} />;
};
