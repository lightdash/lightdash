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
import { Box, Button, Select, Stack, Text, Tooltip } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../providers/Dashboard/useDashboardTileStatusContext';
import FilterFieldSelect from '../dashboardFilters/FilterConfiguration/FilterFieldSelect';
import { useFilterableItemsMap } from '../dashboardFilters/FilterRequirements/useFilterableItemsMap';
import { getFieldCandidates } from './fieldCandidates';
import { getSqlColumnOptions } from './fieldKinds';
import { FieldRow } from './FieldRow';
import classes from './FieldsAndTiles.module.css';
import {
    getAllFreeParameterKeys,
    getParameterLabel,
} from './parameterControls';
import {
    applyFieldToAll,
    applyFieldToUnfilteredTiles,
    getFieldCount,
    getFilterFields,
    removeField,
    removeFieldFromAll,
    setTileField,
    toSqlColumnTarget,
    type FieldCount,
    type FieldsByTile,
    type SqlColumnsByTile,
} from './peers';
import { TabTargets } from './TabTargets';
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
const getSqlColumnCount = (
    rule: DashboardFilterRule,
    reference: string,
    tiles: DashboardTile[],
    fieldsByTile: FieldsByTile,
    sqlColumnsByTile: SqlColumnsByTile,
): FieldCount => ({
    possible: getSqlColumnTiles(reference, tiles, sqlColumnsByTile).length,
    applied: getFieldCount(
        rule,
        reference,
        tiles,
        fieldsByTile,
        sqlColumnsByTile,
    ).applied,
});

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

type FieldSearchProps = {
    fields: DashboardFilterableField[];
    availableTileFilters: Record<string, DashboardFilterableField[]>;
    tiles: DashboardTile[];
    tabs: DashboardTab[];
    activeTabUuid: string | undefined;
    onPick: (field: DashboardFilterableField) => void;
};

type NewControlFieldSearchProps = FieldSearchProps & {
    onEscape: () => void;
};

// The shipped picker does not say when its list is open (no `aria-expanded`),
// so the editor cannot tell that Escape belongs to the list. This keeps
// Escape here: the list closes itself first, and the next press is the
// editor's
const NewControlFieldSearch: FC<NewControlFieldSearchProps> = ({
    onPick,
    onEscape,
    ...picker
}) => {
    const isListOpen = useRef(false);
    return (
        <Box
            data-own-escape
            // Capture: read before the list closes itself on this press
            onKeyDownCapture={(event) => {
                if (event.key === 'Escape' && !isListOpen.current) onEscape();
            }}
        >
            <FilterFieldSelect
                {...picker}
                selectedField={undefined}
                onChange={onPick}
                popoverProps={{
                    onOpen: () => {
                        isListOpen.current = true;
                    },
                    onClose: () => {
                        isListOpen.current = false;
                    },
                }}
            />
        </Box>
    );
};

type AddFieldSearchProps = FieldSearchProps & {
    onDismiss: (byKeyboard: boolean) => void;
};

// Mounted while "Add a field" is open. The shipped picker opens on a click,
// so it is focused and clicked once; it is put away when its list closes
// (Escape, focus leaving, a pick), and Escape hands focus back
const AddFieldSearch: FC<AddFieldSearchProps> = ({
    onPick,
    onDismiss,
    ...picker
}) => {
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const input = root.current?.querySelector('input');
        input?.focus();
        input?.click();
    }, []);
    return (
        <Box
            ref={root}
            className={classes.addFieldSelect}
            // The editor's own Escape handling leaves this search alone
            data-own-escape
            onKeyDown={(event) => {
                if (event.key === 'Escape') onDismiss(true);
            }}
        >
            <FilterFieldSelect
                {...picker}
                selectedField={undefined}
                onChange={onPick}
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
        addParameterControl,
        isNew,
        close,
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
    const getUiString = useUiStrings();
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
    const parameterControls = useDashboardContext((c) => c.parameterControls);
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
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

    // Parameters a tile uses that no control holds yet
    const freeParameters = useMemo(
        () =>
            getAllFreeParameterKeys(
                parameterControls,
                parameterDefinitions,
                tileParameterReferences,
            ).map((key) => ({
                value: key,
                label: getParameterLabel(key, parameterDefinitions),
            })),
        [parameterControls, parameterDefinitions, tileParameterReferences],
    );

    const tiles = useMemo(() => dashboardTiles ?? [], [dashboardTiles]);
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
        () => getSqlColumnOptions(sqlChartTilesMetadata),
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
                    <NewControlFieldSearch
                        fields={starterFields}
                        availableTileFilters={availableTileFilters}
                        tiles={tiles}
                        tabs={dashboardTabs}
                        activeTabUuid={activeTabUuid}
                        onEscape={close}
                        onPick={(field) => {
                            addFirstField(field);
                            // Naming it comes next
                            focusLabelInput();
                        }}
                    />
                ) : (
                    <Select
                        size="xs"
                        allowDeselect={false}
                        withAsterisk
                        label={getUiString('filters.config.selectColumn')}
                        placeholder={getUiString(
                            'filters.config.searchColumnPlaceholder',
                        )}
                        data={sqlColumnOptions.map(
                            ({ reference }) => reference,
                        )}
                        value={null}
                        onChange={(reference) => {
                            const column = sqlColumnOptions.find(
                                (option) => option.reference === reference,
                            );
                            if (column === undefined) return;
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
                {freeParameters.length > 0 && (
                    <Select
                        size="xs"
                        searchable
                        // Enter picks the first match
                        selectFirstOptionOnChange
                        label="Or control a parameter"
                        placeholder="Search parameters"
                        nothingFoundMessage="No parameters match"
                        data={freeParameters}
                        value={null}
                        onChange={(key) => {
                            if (key !== null) addParameterControl(key);
                        }}
                    />
                )}
                <Text fz="xs" c="dimmed" className={classes.hint}>
                    {hasFields
                        ? freeParameters.length > 0
                            ? 'Pick a field to filter tiles by it, or a parameter to set its value on tiles.'
                            : 'Pick a field to filter tiles by it.'
                        : freeParameters.length > 0
                          ? 'Pick a column to filter tiles by it, or a parameter to set its value on tiles.'
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
                            count={(isSqlColumn
                                ? getSqlColumnCount
                                : getFieldCount)(
                                editingRule,
                                fieldId,
                                tiles,
                                filterableFieldsByTileUuid,
                                sqlColumnsByTile,
                            )}
                            isHighlighted={highlightedFieldId === fieldId}
                            isWaiting={isWaiting}
                            onToggleHighlight={() => {
                                if (highlightedFieldId === fieldId)
                                    clearHighlightedField();
                                else setHighlightedFieldId(fieldId);
                            }}
                            onClearHighlight={clearHighlightedField}
                            onHoverChange={(isHovered) => {
                                if (isHovered) setHoveredFieldId(fieldId);
                                else if (hoveredFieldId === fieldId)
                                    setHoveredFieldId(null);
                            }}
                            onAll={() => {
                                if (isSqlColumn) {
                                    updateFilter(
                                        applySqlColumnToAll(
                                            editingRule,
                                            fieldId,
                                            tiles,
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
                                        tiles,
                                        filterableFieldsByTileUuid,
                                    ),
                                );
                            }}
                            onNone={() => {
                                const next = removeFieldFromAll(
                                    editingRule,
                                    fieldId,
                                    tiles,
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
            <TabTargets />
        </Stack>
    );
};
