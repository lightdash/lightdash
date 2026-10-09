import {
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
    removeField,
    removeFieldFromAll,
    setTileField,
    switchTilesToField,
    toSqlColumnTarget,
    type FieldScope,
    type FieldsByTile,
    type SqlColumnsByTile,
} from './peers';
import { useControlsSidebar } from './useControlsSidebar';
import { toDashboardFilterableField } from './useFilterRuleField';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

const SQL_COLUMN_LABEL = 'SQL column';

// Which tiles an action is over; 'every-tab' on a dashboard without tabs
export type TileScope = 'this-tab' | 'every-tab';

export type FieldTiles = {
    field: DashboardFilterableField | null;
    label: string;
    tableLabel: string;
    // On no tile yet
    isWaiting: boolean;
    // Counted over the tiles of the active tab; null on a dashboard without tabs
    thisTabScope: FieldScope | null;
    // Names of the fields a switch would take off their tiles on this tab
    thisTabReplacedLabels: string[];
    // Counted over every tile
    everyTabScope: FieldScope;
    everyTabReplacedLabels: string[];
    addToUnfiltered: (tileScope: TileScope) => void;
    switchFromOthers: (tileScope: TileScope) => void;
    clear: (tileScope: TileScope) => void;
    remove: () => void;
};

const getRuleFieldTarget = (
    rule: DashboardFilterRule,
    fieldId: string,
): DashboardFieldTarget | null => {
    if (rule.target.fieldId === fieldId) return rule.target;
    return (
        Object.values(rule.tileTargets ?? {})
            .filter(isDashboardFieldTarget)
            .find((target) => target.fieldId === fieldId) ?? null
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
    const columnsOnTiles = getSqlColumnTiles(
        reference,
        tiles,
        sqlColumnsByTile,
    ).map(
        (tile) =>
            getTileField(rule, tile, fieldsByTile, sqlColumnsByTile)?.fieldId ??
            null,
    );
    const replacedFieldIds = columnsOnTiles.filter(
        (onTile): onTile is string => onTile !== null && onTile !== reference,
    );
    return {
        possible: columnsOnTiles.length,
        applied: getFieldCount(
            rule,
            reference,
            tiles,
            fieldsByTile,
            sqlColumnsByTile,
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

// What a field of the edited filter is on and what can be done about it, for
// its card and for the bar over the tiles. Null while there is no field to act on
export const useFieldTileActions = ():
    | ((fieldId: string) => FieldTiles)
    | null => {
    const {
        editingRule,
        isPlaceholder,
        removeLastField,
        updateFilter,
        waitingFieldIds,
        removeWaitingField,
        highlightedFieldId,
        setHighlightedFieldId,
        hoveredFieldId,
        setHoveredFieldId,
    } = useControlsSidebar();
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const activeTabUuid = useDashboardContext((c) => c.activeTab?.uuid);
    const fieldsByTile = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const fieldsMap = useFilterableItemsMap();
    const sqlColumnsByTile = useSqlColumnsByTile(editingRule);

    const tiles = useMemo(() => dashboardTiles ?? [], [dashboardTiles]);
    // Without two tabs there is no "this tab": every tile is one scope
    const scopeTabUuid = dashboardTabs.length >= 2 ? activeTabUuid : undefined;
    const thisTabTiles = useMemo(
        () =>
            scopeTabUuid === undefined
                ? null
                : tiles.filter((tile) => tile.tabUuid === scopeTabUuid),
        [tiles, scopeTabUuid],
    );

    if (editingRule === null || isPlaceholder) return null;

    const tilesByScope: Record<TileScope, DashboardTile[]> = {
        'this-tab': thisTabTiles ?? tiles,
        'every-tab': tiles,
    };
    const isSqlColumnFilter = editingRule.target.isSqlColumn === true;
    const getField = (fieldId: string): DashboardFilterableField | null =>
        isSqlColumnFilter && fieldId === editingRule.target.fieldId
            ? null
            : toDashboardFilterableField(fieldsMap[fieldId]);

    return (fieldId) => {
        const isSqlColumn =
            isSqlColumnFilter && fieldId === editingRule.target.fieldId;
        const field = getField(fieldId);
        const isWaiting = waitingFieldIds.includes(fieldId);
        const target =
            getRuleFieldTarget(editingRule, fieldId) ??
            (field === null ? null : { fieldId, tableName: field.table });
        const getScope = (scopeTiles: DashboardTile[]) =>
            (isSqlColumn ? getSqlColumnScope : getFieldScope)(
                editingRule,
                fieldId,
                scopeTiles,
                fieldsByTile,
                sqlColumnsByTile,
            );
        const getReplacedLabels = (scope: FieldScope) =>
            scope.replacedFieldIds.map(
                (replacedId) => getField(replacedId)?.label ?? replacedId,
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
            thisTabReplacedLabels:
                thisTabScope === null ? [] : getReplacedLabels(thisTabScope),
            everyTabScope,
            everyTabReplacedLabels: getReplacedLabels(everyTabScope),
            addToUnfiltered: (tileScope) => {
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
                if (isSqlColumn) {
                    updateFilter(
                        applySqlColumn(
                            editingRule,
                            fieldId,
                            tilesByScope[tileScope],
                            fieldsByTile,
                            sqlColumnsByTile,
                            (onTile) => onTile !== null && onTile !== fieldId,
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
                updateFilter(
                    removeFieldFromAll(
                        editingRule,
                        fieldId,
                        tilesByScope[tileScope],
                        fieldsByTile,
                    ),
                );
            },
            remove: () => {
                if (highlightedFieldId === fieldId) setHighlightedFieldId(null);
                if (hoveredFieldId === fieldId) setHoveredFieldId(null);
                // Its last field: the control goes back to "pick a field",
                // waiting fields included
                if (!isWaiting && getFilterFields(editingRule).length === 1) {
                    removeLastField();
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
};
