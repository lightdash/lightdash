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
import { useFilterableItemsMap } from '../dashboardFilters/FilterRequirements/useFilterableItemsMap';
import {
    applyFieldToUnfilteredTiles,
    getFieldCount,
    getFieldScope,
    getFilterFields,
    getTileField,
    getTilesOnTab,
    removeField,
    removeFieldFromAll,
    setTileField,
    switchTilesToField,
    toSqlColumnTarget,
    type FieldScope,
    type FieldsByTile,
    type SqlColumnsByTile,
} from './peers';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { toDashboardFilterableField } from './useFilterRuleField';

const SQL_COLUMN_LABEL = 'SQL column';

// Which tiles an action is over. Without tabs there is only 'every-tab';
// 'other-tabs' is every tab but the active one
export type TileScope = 'this-tab' | 'other-tabs' | 'every-tab';

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
    // Names of the fields a switch would take off their tiles on this tab, or
    // on every tile without tabs
    replacedLabels: string[];
    // Unfiltered tiles the field fits on the tabs that are not active
    otherTabsUnfiltered: number;
    // False while the tiles' fields are not loaded: an action would write
    // blind, so none does anything
    canAct: boolean;
    addToUnfiltered: (tileScope: TileScope) => void;
    switchFromOthers: (tileScope: TileScope) => void;
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

// Maps the column onto the tiles that have it and pass the test, given the
// field each one is on
const applySqlColumn = (
    rule: DashboardFilterRule,
    reference: string,
    tiles: DashboardTile[],
    fieldsByTile: FieldsByTile,
    sqlColumnsByTile: SqlColumnsByTile,
    takesTile: (fieldIdOnTile: string | null) => boolean,
): DashboardFilterRule =>
    getSqlColumnTiles(reference, tiles, sqlColumnsByTile)
        .filter((tile) =>
            takesTile(
                getTileField(rule, tile, fieldsByTile, sqlColumnsByTile)
                    ?.fieldId ?? null,
            ),
        )
        .reduce(
            (next, tile) =>
                setTileField(
                    next,
                    tile,
                    toSqlColumnTarget(reference),
                    fieldsByTile,
                    sqlColumnsByTile,
                ),
            rule,
        );

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
    const waitingFieldIds = useControlsSidebarSelector(
        (c) => c.waitingFieldIds,
    );
    const removeWaitingField = useControlsSidebarSelector(
        (c) => c.removeWaitingField,
    );
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const activeTabUuid = useDashboardContext((c) => c.activeTab?.uuid);
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
        const otherTabsTiles =
            thisTabTiles === null
                ? []
                : tiles.filter((tile) => !thisTabTiles.includes(tile));
        const tilesByScope: Record<TileScope, DashboardTile[]> = {
            'this-tab': thisTabTiles ?? tiles,
            'other-tabs': otherTabsTiles,
            'every-tab': tiles,
        };
        const isSqlColumnFilter = editingRule.target.isSqlColumn === true;
        const getField = (fieldId: string): DashboardFilterableField | null =>
            isSqlColumnFilter && fieldId === editingRule.target.fieldId
                ? null
                : toDashboardFilterableField(fieldsMap[fieldId]);

        const build = (fieldId: string, isSqlColumn: boolean): FieldTiles => {
            const field = isSqlColumn ? null : getField(fieldId);
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
                replacedLabels: (
                    thisTabScope ?? everyTabScope
                ).replacedFieldIds.map(
                    (replacedId) => getField(replacedId)?.label ?? replacedId,
                ),
                otherTabsUnfiltered: getScope(otherTabsTiles).unfiltered,
                canAct,
                addToUnfiltered: (tileScope) => {
                    if (!canAct) return;
                    if (isSqlColumn) {
                        updateFilter(
                            applySqlColumn(
                                editingRule,
                                fieldId,
                                tilesByScope[tileScope],
                                fieldsByTile,
                                sqlColumnsByTile,
                                (onTile) => onTile === null,
                            ),
                        );
                        return;
                    }
                    if (target === null) return;
                    updateFilter(
                        applyFieldToUnfilteredTiles(
                            editingRule,
                            target,
                            tilesByScope[tileScope],
                            fieldsByTile,
                            sqlColumnsByTile,
                        ),
                    );
                },
                switchFromOthers: (tileScope) => {
                    if (!canAct) return;
                    if (isSqlColumn) {
                        updateFilter(
                            applySqlColumn(
                                editingRule,
                                fieldId,
                                tilesByScope[tileScope],
                                fieldsByTile,
                                sqlColumnsByTile,
                                (onTile) =>
                                    onTile !== null && onTile !== fieldId,
                            ),
                        );
                        return;
                    }
                    if (target === null) return;
                    updateFilter(
                        switchTilesToField(
                            editingRule,
                            target,
                            tilesByScope[tileScope],
                            fieldsByTile,
                            sqlColumnsByTile,
                        ),
                    );
                },
                clear: (tileScope) => {
                    if (!canAct) return;
                    updateFilter(
                        removeFieldFromAll(
                            editingRule,
                            fieldId,
                            tilesByScope[tileScope],
                            fieldsByTile,
                            sqlColumnsByTile,
                            isSqlColumn,
                        ),
                    );
                },
                remove: () => {
                    if (!canAct) return;
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
        removeLastField,
        removeWaitingField,
    ]);
};
