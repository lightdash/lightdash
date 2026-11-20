import {
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import { useCallback, useMemo, type FC, type ReactNode } from 'react';
import FiltersProvider from '../../components/common/Filters/FiltersProvider';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useApp from '../../providers/App/useApp';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectActiveTabUuid,
    selectDashboardTiles,
    selectDashboardEffectiveParameterValues,
    selectSqlChartTilesMetadata,
    useDashboardAllFilters,
    useDashboardSelector,
} from '../dashboard/store';
import {
    getFilterRuleFilterType,
    getUniqueSqlColumns,
} from '../dashboardFilters/FilterConfiguration/utils';
import { useFilterBarPopovers } from '../dashboardFilters/FilterRequirements/useFilterBarPopovers';
import { ControlEditorPopover } from './ControlEditorPopover';
import { focusStartOnMount } from './editorFocus';
import { findFilterRule } from './editorState';
import { FieldsAndTiles } from './FieldsAndTiles';
import classes from './FilterEditor.module.css';
import { EditorActions, EditorFrame, FilterPopover } from './FilterPopover';
import { canTileTakeFilter } from './peers';
import { useAppliedTileCount } from './useAppliedTileCount';
import { useApplyBlockedReason } from './useApplyBlockedReason';
import { useControlsEditorSelector } from './useControlsEditor';
import { useFilterRuleField } from './useFilterRuleField';
import { useFiltersStartOfWeek } from './useFiltersStartOfWeek';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

// A filter with no field yet: a new one's field search alone, or an existing
// one left with no field, which keeps its name and cannot be applied
const PlaceholderEditor: FC<{ rule: DashboardFilterRule }> = ({ rule }) => {
    const isNew = useControlsEditorSelector((c) => c.isNew);
    const emptiedFieldLabel = useControlsEditorSelector(
        (c) => c.emptiedFieldLabel,
    );
    const isAsking = useControlsEditorSelector((c) => c.isAsking);
    const resolvePending = useControlsEditorSelector((c) => c.resolvePending);
    const discard = useControlsEditorSelector((c) => c.discard);
    const close = useControlsEditorSelector((c) => c.close);
    const getUiString = useUiStrings();
    const applyBlockedReason = useApplyBlockedReason(rule);
    // No props, so one element: the list never re-renders on its own
    const fieldsAndTiles = useMemo(() => <FieldsAndTiles />, []);
    const name = isNew
        ? getUiString('controls.newFilter')
        : (rule.label ??
          emptiedFieldLabel ??
          getUiString('controls.filterName'));
    const focusOnMount = useCallback(
        (node: HTMLElement | null) => focusStartOnMount(node),
        [],
    );
    return (
        <EditorFrame
            name={name}
            applyBlockedReason={applyBlockedReason}
            isAsking={isAsking}
            onResolvePending={resolvePending}
            rootRef={focusOnMount}
            // A new filter shows only its field search until a field is picked
            footer={
                isNew ? null : (
                    <EditorActions
                        applyBlockedReason={applyBlockedReason}
                        isApplyDisabled
                        isAsking={isAsking}
                        onCancel={discard}
                        onApply={close}
                    />
                )
            }
        >
            <Box className={classes.content}>{fieldsAndTiles}</Box>
        </EditorFrame>
    );
};

// The popover wired to the provider, the only writer
const FilterEditor: FC<{
    rule: DashboardFilterRule;
    field: DashboardFilterableField | null;
}> = ({ rule, field }) => {
    const isNew = useControlsEditorSelector((c) => c.isNew);
    const isAsking = useControlsEditorSelector((c) => c.isAsking);
    const isViewer = useControlsEditorSelector((c) => c.isViewer);
    const canChooseTiles = useControlsEditorSelector((c) => c.canChooseTiles);
    const editorFilters = useControlsEditorSelector((c) => c.editorFilters);
    const updateFilter = useControlsEditorSelector((c) => c.updateFilter);
    const updateOtherFilters = useControlsEditorSelector(
        (c) => c.updateOtherFilters,
    );
    const startMapping = useControlsEditorSelector((c) => c.startMapping);
    const resolvePending = useControlsEditorSelector((c) => c.resolvePending);
    const discard = useControlsEditorSelector((c) => c.discard);
    const close = useControlsEditorSelector((c) => c.close);
    const { user } = useApp();
    const canManageExplore = !!user.data?.ability?.can('manage', 'Explore');
    const savedFilters = useDashboardContext((c) => c.dashboard?.filters);
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const fieldsByTile = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const sqlColumnsByTile = useSqlColumnsByTile(rule);
    // As mapping counts: the tiles that can take a filter
    const takeableTileCount = useMemo(
        () =>
            (dashboardTiles ?? []).filter((tile) =>
                canTileTakeFilter(tile, fieldsByTile, sqlColumnsByTile),
            ).length,
        [dashboardTiles, fieldsByTile, sqlColumnsByTile],
    );
    const appliedTileCount = useAppliedTileCount(rule);
    // As the shipped popover reads it: the field's type, else the column's
    const sqlChartTilesMetadata = useDashboardSelector(
        selectSqlChartTilesMetadata,
    );
    const filterType = useMemo(
        () =>
            getFilterRuleFilterType(
                field ?? undefined,
                getUniqueSqlColumns(sqlChartTilesMetadata),
                rule,
            ),
        [field, sqlChartTilesMetadata, rule],
    );
    // "Filter rules" opens from its button on the bar, which is only there
    // once the editor has closed
    const filterBarPopovers = useFilterBarPopovers();
    const handleEditRules = useMemo(() => {
        if (!filterBarPopovers) return null;
        return () => {
            close();
            filterBarPopovers.openRulesPopover();
        };
    }, [filterBarPopovers, close]);
    // A viewer's saved filter, as the dashboard was saved: its reset
    const savedRule =
        isViewer && !canChooseTiles && savedFilters
            ? findFilterRule(savedFilters, rule.id)
            : null;
    return (
        <FilterPopover
            rule={rule}
            field={field}
            filterType={filterType}
            isViewer={isViewer}
            canChooseTiles={canChooseTiles}
            isCreatingNew={isViewer && isNew}
            canManageExplore={canManageExplore}
            savedRule={savedRule}
            appliedTileCount={appliedTileCount}
            totalTileCount={takeableTileCount}
            filters={editorFilters}
            isAsking={isAsking}
            initialView="value"
            onChange={updateFilter}
            onChangeOthers={updateOtherFilters}
            onCancel={discard}
            onApply={close}
            onChooseTiles={startMapping}
            onEditRules={handleEditRules}
            onResolvePending={resolvePending}
        />
    );
};

// The shipped value inputs read the dashboard's fields, tiles and filters
const EditorFiltersProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const projectUuid = useProjectUuid();
    const startOfWeek = useFiltersStartOfWeek(projectUuid);
    const allFilters = useDashboardAllFilters();
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const parameterValues = useDashboardSelector(
        selectDashboardEffectiveParameterValues,
    );
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    return (
        <FiltersProvider
            projectUuid={projectUuid}
            itemsMap={allFilterableFieldsMap}
            startOfWeek={startOfWeek}
            dashboardFilters={allFilters}
            dashboardTiles={dashboardTiles}
            filterableFieldsByTileUuid={filterableFieldsByTileUuid}
            activeTabUuid={activeTabUuid}
            parameterValues={parameterValues}
        >
            {children}
        </FiltersProvider>
    );
};

// Mounted with the filter id as key, so the view and the name never carry
// over to another filter
const FilterEditorContent: FC<{ rule: DashboardFilterRule }> = ({ rule }) => {
    const isPlaceholder = useControlsEditorSelector((c) => c.isPlaceholder);
    // A dimension or a metric, as the shipped bar resolves it
    const field = useFilterRuleField(rule);
    if (isPlaceholder) return <PlaceholderEditor rule={rule} />;
    return (
        <EditorFiltersProvider>
            <FilterEditor rule={rule} field={field} />
        </EditorFiltersProvider>
    );
};

// The edited filter's body, keyed by its id
const EditorContent: FC = () => {
    const filterId = useControlsEditorSelector((c) =>
        c.isEditorOpen ? (c.editing?.filterId ?? null) : null,
    );
    const editingRule = useControlsEditorSelector((c) => c.editingRule);
    if (filterId === null || editingRule === null) return null;
    return <FilterEditorContent key={filterId} rule={editingRule} />;
};

type EditorPopoverProps = {
    /** This target's filter is the one edited. */
    isOpen: boolean;
    /** The pill, or "Add filter" for a new filter; must take a ref. */
    children: ReactNode;
};

export const EditorPopover: FC<EditorPopoverProps> = ({ isOpen, children }) => {
    // Mapping stands in for the popover until its Cancel brings it back
    const isMapping = useControlsEditorSelector((c) => c.isMapping);
    return (
        <ControlEditorPopover
            isShown={isOpen && !isMapping}
            dropdownClass="filterDropdown"
            content={<EditorContent />}
        >
            {children}
        </ControlEditorPopover>
    );
};
