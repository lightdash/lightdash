import { type DashboardFilterRule } from '@lightdash/common';
import { Menu, TextInput } from '@mantine/core';
import { useCallback, useMemo, useState, type FC } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { EditorShell } from './EditorShell';
import {
    getFilterFields,
    getTabCounts,
    getTileField,
    canTileTakeFilter,
} from './peers';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useFilterRuleField } from './useFilterRuleField';
import { useFocusLabelOnMount, useLabelDraft } from './useLabelDraft';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

type FilterEditorProps = {
    rule: DashboardFilterRule;
};

// Mounted with the filter id as key, so the label draft and the armed state
// never carry over to another control, and the label takes focus each time
const FilterEditor: FC<FilterEditorProps> = ({ rule: filterRule }) => {
    const removeFilter = useControlsSidebarSelector((c) => c.removeFilter);
    const updateFilter = useControlsSidebarSelector((c) => c.updateFilter);
    const discard = useControlsSidebarSelector((c) => c.discard);
    const close = useControlsSidebarSelector((c) => c.close);
    const isDirty = useControlsSidebarSelector((c) => c.isDirty);
    useFocusLabelOnMount();
    const label = useLabelDraft(filterRule.label ?? '', (next) =>
        updateFilter({ ...filterRule, label: next.trim() ? next : undefined }),
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
    // A dimension or a metric, as the shipped bar resolves it
    const field = useFilterRuleField(filterRule);
    const hasLabel = label.draft.trim() !== '';
    // What the bar shows for a filter with no label: its field's name, or
    // the column's for a SQL column filter
    const fallbackName =
        field?.label ??
        (filterRule.target.isSqlColumn ? filterRule.target.fieldId : null);
    const title = hasLabel ? label.draft : (fallbackName ?? 'Filter');
    const discardLabel = isDirty ? 'Discard changes' : null;
    const fieldCount = getFilterFields(filterRule).length;
    const tabReach =
        dashboardTabs.length > 1
            ? ` on ${reach.tabCount} of ${dashboardTabs.length} tabs`
            : '';
    const subtitle = `${fieldCount} ${fieldCount === 1 ? 'field' : 'fields'} · reaches ${reach.applied} of ${reach.total} ${reach.total === 1 ? 'tile' : 'tiles'}${tabReach}`;

    return (
        <EditorShell
            title={title}
            subtitle={subtitle}
            menu={moreActions}
            onMenuClose={() => setRemoveArmed(false)}
            onClose={close}
            discardLabel={discardLabel}
            onDiscard={discard}
            aboveTabs={
                <>
                    <TextInput
                        label="Filter label"
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
                </>
            }
        />
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
