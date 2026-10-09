import {
    FeatureFlags,
    getItemId,
    isDashboardFieldTarget,
    isMetric,
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import { Box, Button, Stack, Text, Tooltip } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../providers/Dashboard/useDashboardTileStatusContext';
import FilterFieldSelect from '../dashboardFilters/FilterConfiguration/FilterFieldSelect';
import SqlColumnSelect from '../dashboardFilters/FilterConfiguration/SqlColumnSelect';
import { getUniqueSqlColumns } from '../dashboardFilters/FilterConfiguration/utils';
import { useFilterableItemsMap } from '../dashboardFilters/FilterRequirements/useFilterableItemsMap';
import { getFieldCandidates } from './fieldCandidates';
import { FieldRow, type TileScope } from './FieldRow';
import classes from './FieldsAndTiles.module.css';
import {
    applyFieldToAll,
    applyFieldToUnfilteredTiles,
    getFieldCount,
    getFieldScope,
    getFilterFields,
    getTileField,
    removeField,
    removeFieldFromAll,
    setTileField,
    toSqlColumnTarget,
    type FieldScope,
    type FieldsByTile,
    type SqlColumnsByTile,
} from './peers';
import { useControlsSidebar } from './useControlsSidebar';
import {
    toDashboardFilterableField,
    useFilterRuleField,
} from './useFilterRuleField';
import { focusLabelInput } from './useLabelDraft';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

const SQL_COLUMN_LABEL = 'SQL column';
const NO_FIELDS: DashboardFilterableField[] = [];
const NO_TILE_FIELDS: Record<string, DashboardFilterableField[]> = {};

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

const applySqlColumnToAll = (
    rule: DashboardFilterRule,
    reference: string,
    tiles: DashboardTile[],
    fieldsByTile: FieldsByTile,
    sqlColumnsByTile: SqlColumnsByTile,
): DashboardFilterRule =>
    getSqlColumnTiles(reference, tiles, sqlColumnsByTile).reduce(
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

type AddFieldSearchProps = {
    fields: DashboardFilterableField[];
    availableTileFilters: Record<string, DashboardFilterableField[]>;
    tiles: DashboardTile[];
    tabs: DashboardTab[];
    activeTabUuid: string | undefined;
    onPick: (field: DashboardFilterableField) => void;
    onDismiss: (byKeyboard: boolean) => void;
};

// Mounted while "Add a field" is open, focused with its list open. It is put
// away when its list closes (Escape, focus leaving, a pick)
const AddFieldSearch: FC<AddFieldSearchProps> = ({
    onPick,
    onDismiss,
    ...picker
}) => {
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => {
        root.current?.querySelector('input')?.focus();
    }, []);
    return (
        <Box
            ref={root}
            className={classes.addFieldSelect}
            // Escape hands focus back to the button
            onKeyDown={(event) => {
                if (event.key === 'Escape') onDismiss(true);
            }}
        >
            <FilterFieldSelect
                {...picker}
                selectedField={undefined}
                onChange={onPick}
                defaultOpened
                popoverProps={{ onClose: () => onDismiss(false) }}
            />
        </Box>
    );
};

export const FieldsAndTiles: FC = () => {
    const {
        editingRule,
        isPlaceholder,
        addFirstField,
        addFirstSqlColumn,
        isNew,
        updateFilter,
        waitingFieldIds,
        addWaitingField,
        removeWaitingField,
        highlightedFieldId,
        setHighlightedFieldId,
        clearHighlightedField,
        hoveredFieldId,
        setHoveredFieldId,
    } = useControlsSidebar();
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const activeTabUuid = useDashboardContext((c) => c.activeTab?.uuid);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const allFilterableFields = useDashboardContext(
        (c) => c.allFilterableFields,
    );
    const allFilterableMetrics = useDashboardContext(
        (c) => c.allFilterableMetrics,
    );
    const sqlChartTilesMetadata = useDashboardTileStatusContext(
        (c) => c.sqlChartTilesMetadata,
    );
    // Creating a metric filter is gated like the shipped "Add filter"
    const { data: metricFiltersFlag } = useServerFeatureFlag(
        FeatureFlags.MetricDashboardFilters,
    );
    const canCreateMetricFilters =
        metricFiltersFlag?.enabled ?? import.meta.env.DEV;
    const fieldsMap = useFilterableItemsMap();
    const [isAdding, setIsAdding] = useState(false);
    const addButtonRef = useRef<HTMLButtonElement>(null);

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
    const tilesByScope: Record<TileScope, DashboardTile[]> = {
        'this-tab': thisTabTiles ?? tiles,
        'every-tab': tiles,
    };
    const availableTileFilters = filterableFieldsByTileUuid ?? NO_TILE_FIELDS;
    const sqlColumnsByTile = useSqlColumnsByTile(editingRule);

    const dimensions = allFilterableFields ?? NO_FIELDS;
    const metrics = allFilterableMetrics ?? NO_FIELDS;
    // What the shipped "Add filter" lists: every time grain is its own field
    const starterFields = useMemo(
        () => [...dimensions, ...(canCreateMetricFilters ? metrics : [])],
        [dimensions, metrics, canCreateMetricFilters],
    );
    const sqlColumnOptions = useMemo(
        () => getUniqueSqlColumns(sqlChartTilesMetadata),
        [sqlChartTilesMetadata],
    );

    const tileCountByFieldId = useMemo(() => {
        const counts = new Map<string, number>();
        Object.values(availableTileFilters).forEach((tileFields) => {
            new Set(tileFields.map(getItemId)).forEach((fieldId) =>
                counts.set(fieldId, (counts.get(fieldId) ?? 0) + 1),
            );
        });
        return counts;
    }, [availableTileFilters]);

    const fieldIds = useMemo(
        () => (editingRule === null ? [] : getFilterFields(editingRule)),
        [editingRule],
    );

    const targetField = useFilterRuleField(editingRule);

    // Listed rows: the filter's fields, then the ones waiting for a tile
    const rowIds = useMemo(
        () => [...fieldIds, ...waitingFieldIds],
        [fieldIds, waitingFieldIds],
    );

    // Fields of the filter's type that some tile offers, even a tile that
    // already has a field: its card can switch to the new one. A metric
    // filter takes metrics, any other filter dimensions
    const candidates = useMemo(() => {
        if (targetField === null) return [];
        return getFieldCandidates(
            isMetric(targetField) ? metrics : dimensions,
            rowIds,
            targetField,
        ).filter(
            (field) => (tileCountByFieldId.get(getItemId(field)) ?? 0) > 0,
        );
    }, [targetField, rowIds, dimensions, metrics, tileCountByFieldId]);

    if (editingRule === null) return null;

    if (isPlaceholder) {
        // As in the shipped "Add filter": columns only when no tile has fields
        const hasFields = starterFields.length > 0;
        return (
            <Stack gap="xs">
                {hasFields ? (
                    <FilterFieldSelect
                        fields={starterFields}
                        availableTileFilters={availableTileFilters}
                        tiles={tiles}
                        tabs={dashboardTabs}
                        activeTabUuid={activeTabUuid}
                        selectedField={undefined}
                        onChange={(field) => {
                            addFirstField(field);
                            // Naming it comes next
                            focusLabelInput();
                        }}
                    />
                ) : (
                    <SqlColumnSelect
                        columns={sqlColumnOptions}
                        value={undefined}
                        onChange={(column) => {
                            addFirstSqlColumn(
                                column,
                                Object.fromEntries(
                                    Object.entries(sqlChartTilesMetadata).map(
                                        ([tileUuid, metadata]) => [
                                            tileUuid,
                                            metadata.columns,
                                        ],
                                    ),
                                ),
                            );
                            focusLabelInput();
                        }}
                    />
                )}
                <Text fz="xs" c="dimmed" className={classes.hint}>
                    {hasFields
                        ? 'Pick a field to filter tiles by it.'
                        : 'Pick a column to filter tiles by it.'}
                </Text>
            </Stack>
        );
    }

    const isSqlColumnFilter = editingRule.target.isSqlColumn === true;
    const isSqlColumnRow = (fieldId: string) =>
        isSqlColumnFilter && fieldId === editingRule.target.fieldId;

    const getField = (fieldId: string): DashboardFilterableField | null =>
        isSqlColumnRow(fieldId)
            ? null
            : toDashboardFilterableField(fieldsMap[fieldId]);

    const clearHighlight = (fieldId: string) => {
        if (highlightedFieldId === fieldId) setHighlightedFieldId(null);
        if (hoveredFieldId === fieldId) setHoveredFieldId(null);
    };

    const hasCandidates = candidates.length > 0;

    return (
        <Stack gap="lg">
            <Stack gap="xs">
                <Stack gap={2}>
                    <Text fz="sm" fw={600}>
                        Fields in this filter
                    </Text>
                    <Text fz="xs" c="dimmed">
                        Choose which field each tile is filtered by.
                    </Text>
                </Stack>
                {rowIds.map((fieldId) => {
                    const field = getField(fieldId);
                    const isSqlColumn = isSqlColumnRow(fieldId);
                    const isWaiting = waitingFieldIds.includes(fieldId);
                    const target =
                        getRuleFieldTarget(editingRule, fieldId) ??
                        (field === null
                            ? null
                            : { fieldId, tableName: field.table });
                    const getScope = (scopeTiles: DashboardTile[]) =>
                        (isSqlColumn ? getSqlColumnScope : getFieldScope)(
                            editingRule,
                            fieldId,
                            scopeTiles,
                            filterableFieldsByTileUuid,
                            sqlColumnsByTile,
                        );
                    const getReplacedLabels = (scope: FieldScope) =>
                        scope.replacedFieldIds.map(
                            (replacedId) =>
                                getField(replacedId)?.label ?? replacedId,
                        );
                    const thisTabScope =
                        thisTabTiles === null ? null : getScope(thisTabTiles);
                    const everyTabScope = getScope(tiles);
                    return (
                        <FieldRow
                            key={fieldId}
                            field={field}
                            // Each time grain is a field of its own, so the
                            // name says which one
                            label={field?.label ?? fieldId}
                            tableLabel={
                                isSqlColumn
                                    ? SQL_COLUMN_LABEL
                                    : (field?.tableLabel ??
                                      target?.tableName ??
                                      '')
                            }
                            thisTabScope={thisTabScope}
                            thisTabReplacedLabels={
                                thisTabScope === null
                                    ? []
                                    : getReplacedLabels(thisTabScope)
                            }
                            everyTabScope={everyTabScope}
                            everyTabReplacedLabels={getReplacedLabels(
                                everyTabScope,
                            )}
                            isHighlighted={highlightedFieldId === fieldId}
                            isWaiting={isWaiting}
                            onToggleHighlight={() => {
                                if (highlightedFieldId === fieldId)
                                    clearHighlightedField();
                                else setHighlightedFieldId(fieldId);
                            }}
                            onHoverChange={(isHovered) => {
                                if (isHovered) setHoveredFieldId(fieldId);
                                else if (hoveredFieldId === fieldId)
                                    setHoveredFieldId(null);
                            }}
                            onAddToUnfiltered={(tileScope) => {
                                const scopedTiles = tilesByScope[tileScope];
                                if (isSqlColumn) {
                                    updateFilter(
                                        applySqlColumnToAll(
                                            editingRule,
                                            fieldId,
                                            scopedTiles.filter(
                                                (tile) =>
                                                    getTileField(
                                                        editingRule,
                                                        tile,
                                                        filterableFieldsByTileUuid,
                                                        sqlColumnsByTile,
                                                    ) === null,
                                            ),
                                            filterableFieldsByTileUuid,
                                            sqlColumnsByTile,
                                        ),
                                    );
                                    return;
                                }
                                if (target === null) return;
                                updateFilter(
                                    applyFieldToUnfilteredTiles(
                                        editingRule,
                                        target,
                                        scopedTiles,
                                        filterableFieldsByTileUuid,
                                        sqlColumnsByTile,
                                    ),
                                );
                            }}
                            onAll={(tileScope) => {
                                const scopedTiles = tilesByScope[tileScope];
                                if (isSqlColumn) {
                                    updateFilter(
                                        applySqlColumnToAll(
                                            editingRule,
                                            fieldId,
                                            scopedTiles,
                                            filterableFieldsByTileUuid,
                                            sqlColumnsByTile,
                                        ),
                                    );
                                    return;
                                }
                                if (target === null) return;
                                updateFilter(
                                    applyFieldToAll(
                                        editingRule,
                                        target,
                                        scopedTiles,
                                        filterableFieldsByTileUuid,
                                    ),
                                );
                            }}
                            onClear={(tileScope) => {
                                const next = removeFieldFromAll(
                                    editingRule,
                                    fieldId,
                                    tilesByScope[tileScope],
                                    filterableFieldsByTileUuid,
                                );
                                updateFilter(next);
                            }}
                            onRemove={() => {
                                clearHighlight(fieldId);
                                if (isWaiting) {
                                    removeWaitingField(fieldId);
                                    return;
                                }
                                updateFilter(
                                    removeField(
                                        editingRule,
                                        fieldId,
                                        tiles,
                                        filterableFieldsByTileUuid,
                                    ),
                                );
                                removeWaitingField(fieldId);
                            }}
                            // Without its last field the filter could not be
                            // kept, and closing would bring it back
                            removeDisabledReason={
                                isWaiting || fieldIds.length > 1
                                    ? null
                                    : isNew
                                      ? 'Discard the control instead'
                                      : 'Remove the filter from More actions instead'
                            }
                        />
                    );
                })}
            </Stack>
            <Stack gap="xs" align="flex-start">
                <Tooltip
                    label="No other field of this type is on a tile"
                    disabled={hasCandidates}
                >
                    <Button
                        ref={addButtonRef}
                        variant="light"
                        size="xs"
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={() => {
                            if (hasCandidates) setIsAdding((open) => !open);
                        }}
                        aria-expanded={isAdding && hasCandidates}
                        data-disabled={!hasCandidates || undefined}
                        aria-disabled={!hasCandidates || undefined}
                    >
                        Add a field
                    </Button>
                </Tooltip>
                {isAdding && hasCandidates && (
                    <AddFieldSearch
                        fields={candidates}
                        availableTileFilters={availableTileFilters}
                        tiles={tiles}
                        tabs={dashboardTabs}
                        activeTabUuid={activeTabUuid}
                        onDismiss={(byKeyboard) => {
                            setIsAdding(false);
                            if (byKeyboard) addButtonRef.current?.focus();
                        }}
                        onPick={(field) => {
                            const fieldId = getItemId(field);
                            const next = applyFieldToUnfilteredTiles(
                                editingRule,
                                { fieldId, tableName: field.table },
                                tiles,
                                filterableFieldsByTileUuid,
                                sqlColumnsByTile,
                            );
                            updateFilter(next);
                            // Every tile it fits already has a field: it
                            // waits, and the tile cards offer the switch
                            // and with no tile to show, it is not clicked
                            if (getFilterFields(next).includes(fieldId))
                                setHighlightedFieldId(fieldId);
                            else addWaitingField(fieldId);
                            setIsAdding(false);
                            addButtonRef.current?.focus();
                        }}
                    />
                )}
            </Stack>
        </Stack>
    );
};
