import {
    getDashboardFilterableFieldKey,
    getItemId,
    interpolateUiString,
    isDashboardDataAppTileType,
    isDashboardFieldTarget,
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardTile,
    type UiStringResolver,
} from '@lightdash/common';
import { useMemo } from 'react';
import { getFieldSelectLabel } from '../../components/common/FieldSelect/fieldSelectLabel';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectActiveTabUuid,
    selectDashboardTabs,
    selectDashboardTiles,
    useDashboardSelector,
} from '../dashboard/store';
import {
    applyFieldToAllTiles,
    getFieldCount,
    getFieldScope,
    getChipFieldId,
    getFilterChips,
    getTileField,
    getTilesOnTab,
    isSqlColumnRow,
    isTileInRow,
    removeField,
    removeFieldFromAll,
    toSqlColumnTarget,
    type FieldScope,
    type FilterChip,
    type FieldsByTile,
    type SqlColumnsByTile,
} from './peers';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useFilterFieldsMap } from './useFilterFieldsMap';

// The fields a press replaces: one or two by name, more as "other fields"
export const nameReplacedFields = (
    labels: string[],
    getUiString: UiStringResolver,
): string => {
    if (labels.length > 2) return getUiString('filters.fieldBar.otherFields');
    if (labels.length === 2)
        return interpolateUiString(getUiString('filters.fieldBar.twoFields'), {
            first: labels[0],
            second: labels[1],
        });
    return labels.join('');
};

// Which tiles an action is over. Without tabs 'this-tab' is every tile and
// 'other-tabs' none
export type TileScope = 'this-tab' | 'other-tabs' | 'every-tab';

export type FieldTiles = {
    field: DashboardFilterableField | null;
    // With its table, as the shipped tile select names it
    label: string;
    name: string;
    tableLabel: string;
    // On no tile yet
    isWaiting: boolean;
    // Counted over the tiles of the active tab; null on a dashboard without tabs
    thisTabScope: FieldScope | null;
    // Counted over the tiles of every other tab; null on a dashboard without tabs
    otherTabsScope: FieldScope | null;
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
    // A chip of the filter by its key (`getFilterChips`): a field as its
    // tiles label it, or a column (`isSqlColumnRow`)
    forField: (rowKey: string) => FieldTiles;
    // The chips, in order
    chips: FilterChip[];
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
    const fieldsMap = useFilterFieldsMap();
    const sqlColumnLabel = useUiStrings()('filters.rail.sqlColumn');

    return useMemo(() => {
        if (editingRule === null || isPlaceholder) return null;

        const allTiles = dashboardTiles ?? [];
        const chips = getFilterChips(
            editingRule,
            dashboardTiles,
            fieldsByTile,
            fieldsMap,
            sqlColumnsByTile,
        );
        // Without two tabs there is no "this tab": every tile is one scope
        const scopeTabUuid =
            dashboardTabs.length >= 2 ? activeTabUuid : undefined;
        const isSqlColumnFilter = editingRule.target.isSqlColumn === true;
        const getField = (fieldId: string): DashboardFilterableField | null =>
            isSqlColumnFilter && fieldId === editingRule.target.fieldId
                ? null
                : (fieldsMap[fieldId] ?? null);
        const labelOfField = (fieldId: string) => {
            const field = getField(fieldId);
            return field === null ? fieldId : getFieldSelectLabel(field, false);
        };
        // A column is never looked up as a field
        const labelOfColumn = (reference: string) => reference;

        const build = (chip: FilterChip, isSqlColumn: boolean): FieldTiles => {
            const { key: rowKey, fieldId } = chip;
            // Only the tiles that label the field as this chip does
            const tiles = isSqlColumn
                ? allTiles
                : allTiles.filter((tile) =>
                      isTileInRow(tile, chip, fieldsByTile, fieldsMap),
                  );
            const thisTabTiles =
                scopeTabUuid === undefined
                    ? null
                    : getTilesOnTab(tiles, dashboardTabs, scopeTabUuid);
            const otherTabsTiles =
                thisTabTiles === null
                    ? null
                    : tiles.filter((tile) => !thisTabTiles.includes(tile));
            const tilesByScope: Record<TileScope, DashboardTile[]> = {
                'this-tab': thisTabTiles ?? tiles,
                'other-tabs': otherTabsTiles ?? [],
                'every-tab': tiles,
            };
            // Named as its own tiles' explore names it
            const field = isSqlColumn
                ? null
                : (tiles
                      .map((tile) =>
                          fieldsByTile?.[tile.uuid]?.find(
                              (candidate) => getItemId(candidate) === fieldId,
                          ),
                      )
                      .find(
                          (candidate) =>
                              candidate !== undefined &&
                              getDashboardFilterableFieldKey(candidate) ===
                                  rowKey,
                      ) ?? getField(fieldId));
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
            const otherTabsScope =
                otherTabsTiles === null ? null : getScope(otherTabsTiles);
            const everyTabScope = getScope(tiles);
            const getScopeOf = (tileScope: TileScope) =>
                tileScope === 'this-tab'
                    ? (thisTabScope ?? everyTabScope)
                    : tileScope === 'other-tabs'
                      ? (otherTabsScope ?? getScope([]))
                      : everyTabScope;
            // Undo for a this-tab action lives only while that tab is in view
            const isAcrossTabs = (tileScope: TileScope) =>
                tileScope !== 'this-tab' && thisTabScope !== null;

            return {
                field,
                // Each time grain is a field of its own, so the name says which one
                label:
                    field === null
                        ? labelOf(fieldId)
                        : getFieldSelectLabel(field, false),
                name: field?.label ?? fieldId,
                tableLabel: isSqlColumn
                    ? sqlColumnLabel
                    : (field?.tableLabel ?? target?.tableName ?? ''),
                isWaiting,
                thisTabScope,
                otherTabsScope,
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
                            fieldId: rowKey,
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
                            fieldId: rowKey,
                            tileCount: getScopeOf(tileScope).applied,
                            replaced: 0,
                            acrossTabs: isAcrossTabs(tileScope),
                        },
                    );
                },
                remove: () => {
                    if (!canAct) return;
                    // A column only SQL chart tiles are on leaves them
                    if (
                        isSqlColumn &&
                        !(
                            isSqlColumnFilter &&
                            fieldId === editingRule.target.fieldId
                        )
                    ) {
                        const next = removeFieldFromAll(
                            editingRule,
                            fieldId,
                            allTiles,
                            fieldsByTile,
                            sqlColumnsByTile,
                            true,
                        );
                        if (next !== editingRule) updateFilter(next);
                        return;
                    }
                    // The field stays on its other chips' tiles
                    if (
                        chips.filter((other) => other.fieldId === fieldId)
                            .length > 1
                    ) {
                        const next = removeFieldFromAll(
                            editingRule,
                            fieldId,
                            tiles,
                            fieldsByTile,
                            sqlColumnsByTile,
                            false,
                        );
                        if (next !== editingRule) updateFilter(next);
                        return;
                    }
                    // Its last row: the control goes back to "pick a field",
                    // waiting fields included, and keeps the field's name
                    if (!isWaiting && chips.length === 1) {
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
                        removeField(
                            editingRule,
                            fieldId,
                            allTiles,
                            fieldsByTile,
                            sqlColumnsByTile,
                        ),
                    );
                    removeWaitingField(fieldId);
                },
            };
        };

        return {
            chips,
            forField: (rowKey) => {
                const fieldId = getChipFieldId(chips, rowKey);
                return build(
                    { key: rowKey, fieldId },
                    isSqlColumnRow(editingRule, fieldId),
                );
            },
            forSqlColumn: (reference) =>
                build({ key: reference, fieldId: reference }, true),
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
        sqlColumnLabel,
    ]);
};
