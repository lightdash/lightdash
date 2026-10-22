import {
    isDashboardDataAppTileType,
    isDashboardFieldTarget,
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardTile,
} from '@lightdash/common';
import { useMemo } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectActiveTabUuid,
    selectDashboardTabs,
    selectDashboardTiles,
    useDashboardSelector,
} from '../dashboard/store';
import { useFilterableItemsMap } from '../dashboardFilters/FilterRequirements/useFilterableItemsMap';
import {
    applyFieldToAllTiles,
    getFieldCount,
    getFieldScope,
    getFilterFields,
    getTileField,
    getTilesOnTab,
    removeField,
    removeFieldFromAll,
    toSqlColumnTarget,
    type FieldScope,
    type FieldsByTile,
    type SqlColumnsByTile,
} from './peers';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { toDashboardFilterableField } from './useFilterRuleField';

const SQL_COLUMN_LABEL = 'SQL column';

// The fields a press replaces: one or two by name, more as "other fields"
export const nameReplacedFields = (labels: string[]): string =>
    labels.length > 2 ? 'other fields' : labels.join(' and ');

// Which tiles an action is over. Without tabs there is only 'every-tab'
export type TileScope = 'this-tab' | 'every-tab';

export type FieldTiles = {
    field: DashboardFilterableField | null;
    label: string;
    tableLabel: string;
    // On no tile yet
    isWaiting: boolean;
    // Counted over the tiles of the active tab; null on a dashboard without tabs
    thisTabScope: FieldScope | null;
    // Counted over every tile
    everyTabScope: FieldScope;
    // False while the tiles' fields are not loaded: an action would write
    // blind, so none does anything
    canAct: boolean;
    // The name of another field or column of the filter, as its row reads
    labelOf: (fieldId: string) => string;
    // Every tile of the scope that offers it ends up on it, over other
    // fields; the bar can undo it
    applyToAll: (tileScope: TileScope) => void;
    clear: (tileScope: TileScope) => void;
    remove: () => void;
};

const getRuleFieldTarget = (
    rule: DashboardFilterRule,
    fieldId: string,
): DashboardFieldTarget | null => {
    if (rule.target.fieldId === fieldId && !rule.target.isSqlColumn)
        return rule.target;
    return (
        Object.values(rule.tileTargets ?? {})
            .filter(isDashboardFieldTarget)
            .find(
                (target) => !target.isSqlColumn && target.fieldId === fieldId,
            ) ?? null
    );
};

const getSqlColumnTiles = (
    reference: string,
    tiles: DashboardTile[],
    sqlColumnsByTile: SqlColumnsByTile,
): DashboardTile[] =>
    tiles.filter((tile) =>
        (sqlColumnsByTile[tile.uuid] ?? []).some(
            (column) => column.reference === reference,
        ),
    );

// A SQL column is offered by the SQL chart tiles that have it, never by a
// tile's fields
const getSqlColumnScope = (
    rule: DashboardFilterRule,
    reference: string,
    tiles: DashboardTile[],
    fieldsByTile: FieldsByTile,
    sqlColumnsByTile: SqlColumnsByTile,
): FieldScope => {
    const withColumn = getSqlColumnTiles(reference, tiles, sqlColumnsByTile);
    const getFieldIdOn = (tile: DashboardTile) =>
        getTileField(rule, tile, fieldsByTile, sqlColumnsByTile)?.fieldId ??
        null;
    const columnsOnTiles = withColumn.map(getFieldIdOn);
    const replacedFieldIds = columnsOnTiles.filter(
        (onTile): onTile is string => onTile !== null && onTile !== reference,
    );
    // On the column without returning it any more: still one of its tiles.
    // A data app tile follows the rule and is never on a column
    const onColumnOnly = tiles.filter(
        (tile) =>
            !withColumn.includes(tile) &&
            !isDashboardDataAppTileType(tile) &&
            getFieldIdOn(tile) === reference,
    );
    return {
        possible: withColumn.length + onColumnOnly.length,
        applied: getFieldCount(
            rule,
            reference,
            tiles,
            fieldsByTile,
            sqlColumnsByTile,
            true,
        ).applied,
        unfiltered: columnsOnTiles.filter((onTile) => onTile === null).length,
        replaced: replacedFieldIds.length,
        replacedFieldIds: [...new Set(replacedFieldIds)],
    };
};

export type FieldTileActions = {
    // A field of the filter; the column of a SQL column filter is one too
    forField: (fieldId: string) => FieldTiles;
    // A column SQL chart tiles are mapped to, on a filter of any kind
    forSqlColumn: (reference: string) => FieldTiles;
};

// A field's counts and actions, for its card, the bar and the tile cards.
// Null with no field to act on. Reads the context through selectors
export const useFieldTileActions = (
    sqlColumnsByTile: SqlColumnsByTile,
): FieldTileActions | null => {
    const editingRule = useControlsSidebarSelector((c) => c.editingRule);
    const isPlaceholder = useControlsSidebarSelector((c) => c.isPlaceholder);
    const removeLastField = useControlsSidebarSelector(
        (c) => c.removeLastField,
    );
    const updateFilter = useControlsSidebarSelector((c) => c.updateFilter);
    const applyWithUndo = useControlsSidebarSelector((c) => c.applyWithUndo);
    const waitingFieldIds = useControlsSidebarSelector(
        (c) => c.waitingFieldIds,
    );
    const removeWaitingField = useControlsSidebarSelector(
        (c) => c.removeWaitingField,
    );
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const dashboardTabs = useDashboardSelector(selectDashboardTabs);
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    const fieldsByTile = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const fieldsMap = useFilterableItemsMap();

    return useMemo(() => {
        if (editingRule === null || isPlaceholder) return null;

        const tiles = dashboardTiles ?? [];
        // Without two tabs there is no "this tab": every tile is one scope
        const scopeTabUuid =
            dashboardTabs.length >= 2 ? activeTabUuid : undefined;
        const thisTabTiles =
            scopeTabUuid === undefined
                ? null
                : getTilesOnTab(tiles, dashboardTabs, scopeTabUuid);
        const tilesByScope: Record<TileScope, DashboardTile[]> = {
            'this-tab': thisTabTiles ?? tiles,
            'every-tab': tiles,
        };
        const isSqlColumnFilter = editingRule.target.isSqlColumn === true;
        const getField = (fieldId: string): DashboardFilterableField | null =>
            isSqlColumnFilter && fieldId === editingRule.target.fieldId
                ? null
                : toDashboardFilterableField(fieldsMap[fieldId]);
        const labelOfField = (fieldId: string) =>
            getField(fieldId)?.label ?? fieldId;
        // A column is never looked up as a field
        const labelOfColumn = (reference: string) => reference;

        const build = (fieldId: string, isSqlColumn: boolean): FieldTiles => {
            const field = isSqlColumn ? null : getField(fieldId);
            const labelOf = isSqlColumn ? labelOfColumn : labelOfField;
            const isWaiting = waitingFieldIds.includes(fieldId);
            const target = isSqlColumn
                ? null
                : (getRuleFieldTarget(editingRule, fieldId) ??
                  (field === null
                      ? null
                      : { fieldId, tableName: field.table }));
            // A SQL column row goes by the tiles' columns, which it only
            // lists once they are loaded
            const canAct = isSqlColumn || fieldsByTile !== undefined;
            const getScope = (scopeTiles: DashboardTile[]) =>
                (isSqlColumn ? getSqlColumnScope : getFieldScope)(
                    editingRule,
                    fieldId,
                    scopeTiles,
                    fieldsByTile,
                    sqlColumnsByTile,
                );
            const thisTabScope =
                thisTabTiles === null ? null : getScope(thisTabTiles);
            const everyTabScope = getScope(tiles);
            const getScopeOf = (tileScope: TileScope) =>
                tileScope === 'this-tab' && thisTabScope !== null
                    ? thisTabScope
                    : everyTabScope;
            const isAcrossTabs = (tileScope: TileScope) =>
                tileScope === 'every-tab' && thisTabScope !== null;

            return {
                field,
                // Each time grain is a field of its own, so the name says which one
                label: field?.label ?? fieldId,
                tableLabel: isSqlColumn
                    ? SQL_COLUMN_LABEL
                    : (field?.tableLabel ?? target?.tableName ?? ''),
                isWaiting,
                thisTabScope,
                everyTabScope,
                canAct,
                labelOf,
                applyToAll: (tileScope) => {
                    const fieldTarget = isSqlColumn
                        ? toSqlColumnTarget(fieldId)
                        : target;
                    if (!canAct || fieldTarget === null) return;
                    const scope = getScopeOf(tileScope);
                    applyWithUndo(
                        applyFieldToAllTiles(
                            editingRule,
                            fieldTarget,
                            tilesByScope[tileScope],
                            fieldsByTile,
                            sqlColumnsByTile,
                        ),
                        {
                            kind: 'apply',
                            fieldId,
                            tileCount: scope.possible,
                            replaced: scope.replaced,
                            acrossTabs: isAcrossTabs(tileScope),
                        },
                    );
                },
                clear: (tileScope) => {
                    if (!canAct) return;
                    applyWithUndo(
                        removeFieldFromAll(
                            editingRule,
                            fieldId,
                            tilesByScope[tileScope],
                            fieldsByTile,
                            sqlColumnsByTile,
                            isSqlColumn,
                        ),
                        {
                            kind: 'clear',
                            fieldId,
                            tileCount: getScopeOf(tileScope).applied,
                            replaced: 0,
                            acrossTabs: isAcrossTabs(tileScope),
                        },
                    );
                },
                remove: () => {
                    // A column on a field filter is no row of it to remove
                    const isRow =
                        !isSqlColumn ||
                        (isSqlColumnFilter &&
                            fieldId === editingRule.target.fieldId);
                    if (!canAct || !isRow) return;
                    // Its last field: the control goes back to "pick a field",
                    // waiting fields included, and keeps the field's name
                    if (
                        !isWaiting &&
                        getFilterFields(editingRule, dashboardTiles).length ===
                            1
                    ) {
                        // An unknown field has no name: the title stays "Filter"
                        removeLastField(
                            field?.label ?? (isSqlColumn ? fieldId : null),
                        );
                        return;
                    }
                    if (isWaiting) {
                        removeWaitingField(fieldId);
                        return;
                    }
                    updateFilter(
                        removeField(editingRule, fieldId, tiles, fieldsByTile),
                    );
                    removeWaitingField(fieldId);
                },
            };
        };

        return {
            forField: (fieldId) =>
                build(
                    fieldId,
                    isSqlColumnFilter && fieldId === editingRule.target.fieldId,
                ),
            forSqlColumn: (reference) => build(reference, true),
        };
    }, [
        editingRule,
        isPlaceholder,
        dashboardTiles,
        dashboardTabs,
        activeTabUuid,
        fieldsByTile,
        fieldsMap,
        sqlColumnsByTile,
        waitingFieldIds,
        updateFilter,
        applyWithUndo,
        removeLastField,
        removeWaitingField,
    ]);
};
