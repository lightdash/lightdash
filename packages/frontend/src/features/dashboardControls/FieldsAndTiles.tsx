import {
    getItemId,
    isDashboardFieldTarget,
    isDimension,
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Box, Button, Stack, Text, Tooltip } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { getFieldDisplayLabel } from './fieldGrains';
import { getFieldKind } from './fieldKinds';
import { FieldPicker } from './FieldPicker';
import { FieldRow } from './FieldRow';
import classes from './FieldsAndTiles.module.css';
import {
    applyFieldToAll,
    applyFieldToUnfilteredTiles,
    getFieldCount,
    getFilterFields,
    removeField,
    removeFieldFromAll,
} from './peers';
import { useControlsSidebar } from './useControlsSidebar';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

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

// Every grain of a time dimension shares one key
const getGrainKey = (field: DashboardFilterableField): string | null =>
    isDimension(field)
        ? `${field.table}.${field.timeIntervalBaseDimensionName ?? field.name}`
        : null;

export const FieldsAndTiles: FC = () => {
    const {
        editingRule,
        isPlaceholder,
        addFirstField,
        clearFields,
        updateFilter,
        waitingFieldIds,
        addWaitingField,
        removeWaitingField,
        highlightedFieldId,
        setHighlightedFieldId,
        hoveredFieldId,
        setHoveredFieldId,
    } = useControlsSidebar();
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const allFilterableFields = useDashboardContext(
        (c) => c.allFilterableFields,
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const [isAdding, setIsAdding] = useState(false);

    const tiles = useMemo(() => dashboardTiles ?? [], [dashboardTiles]);
    const sqlColumnsByTile = useSqlColumnsByTile(editingRule);

    const fields = useMemo(
        () => allFilterableFields ?? [],
        [allFilterableFields],
    );

    const tileCountByFieldId = useMemo(() => {
        const counts = new Map<string, number>();
        Object.values(filterableFieldsByTileUuid ?? {}).forEach(
            (tileFields) => {
                new Set(tileFields.map(getItemId)).forEach((fieldId) =>
                    counts.set(fieldId, (counts.get(fieldId) ?? 0) + 1),
                );
            },
        );
        return counts;
    }, [filterableFieldsByTileUuid]);

    const getTileCount = useCallback(
        (field: DashboardFilterableField) =>
            tileCountByFieldId.get(getItemId(field)) ?? 0,
        [tileCountByFieldId],
    );

    const fieldIds = useMemo(
        () => (editingRule === null ? [] : getFilterFields(editingRule)),
        [editingRule],
    );

    const targetField =
        editingRule === null
            ? null
            : (allFilterableFieldsMap[editingRule.target.fieldId] ?? null);
    const kind = targetField === null ? null : getFieldKind(targetField);

    // Listed rows: the filter's fields, then the ones waiting for a tile
    const rowIds = useMemo(
        () => [...fieldIds, ...waitingFieldIds],
        [fieldIds, waitingFieldIds],
    );

    // Fields of the filter's kind that some tile offers, even a tile that
    // already has a field: its card can switch to the new one
    const candidates = useMemo(() => {
        if (editingRule === null || kind === null) return [];
        const taken = new Set(rowIds);
        const takenGrainKeys = new Set(
            fields
                .filter((field) => taken.has(getItemId(field)))
                .map(getGrainKey)
                .filter((key): key is string => key !== null),
        );
        return fields.filter((field) => {
            const fieldId = getItemId(field);
            const grainKey = getGrainKey(field);
            return (
                !taken.has(fieldId) &&
                (grainKey === null || !takenGrainKeys.has(grainKey)) &&
                getFieldKind(field) === kind &&
                (tileCountByFieldId.get(fieldId) ?? 0) > 0
            );
        });
    }, [editingRule, kind, rowIds, fields, tileCountByFieldId]);

    if (editingRule === null) return null;

    if (isPlaceholder) {
        return (
            <Stack gap="xs">
                <Text fz="xs" c="dimmed">
                    Select a field to filter
                </Text>
                <FieldPicker
                    fields={fields}
                    getTileCount={getTileCount}
                    onPickField={addFirstField}
                />
            </Stack>
        );
    }

    const getField = (fieldId: string): DashboardFilterableField | null =>
        allFilterableFieldsMap[fieldId] ?? null;

    const clearHighlight = (fieldId: string) => {
        if (highlightedFieldId === fieldId) setHighlightedFieldId(null);
        if (hoveredFieldId === fieldId) setHoveredFieldId(null);
    };

    // One name per field; a grain is shown only when two rows would collide
    const displayLabels = rowIds.map((fieldId) => {
        const field = getField(fieldId);
        return field ? getFieldDisplayLabel(field, fields) : fieldId;
    });
    const getRowLabel = (fieldId: string, index: number): string => {
        const display = displayLabels[index];
        const isDuplicate =
            displayLabels.filter((label) => label === display).length > 1;
        return isDuplicate ? (getField(fieldId)?.label ?? fieldId) : display;
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
                {rowIds.map((fieldId, index) => {
                    const field = getField(fieldId);
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
                            label={getRowLabel(fieldId, index)}
                            tableLabel={
                                field?.tableLabel ?? target?.tableName ?? ''
                            }
                            count={getFieldCount(
                                editingRule,
                                fieldId,
                                tiles,
                                filterableFieldsByTileUuid,
                                sqlColumnsByTile,
                            )}
                            isHighlighted={highlightedFieldId === fieldId}
                            onToggleHighlight={() =>
                                setHighlightedFieldId(
                                    highlightedFieldId === fieldId
                                        ? null
                                        : fieldId,
                                )
                            }
                            onHoverChange={(isHovered) => {
                                if (isHovered) setHoveredFieldId(fieldId);
                                else if (hoveredFieldId === fieldId)
                                    setHoveredFieldId(null);
                            }}
                            onAll={() => {
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
                                if (fieldIds.length <= 1) {
                                    clearFields();
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
                {isAdding && hasCandidates && kind !== null && (
                    <Box className={classes.addFieldSelect}>
                        <FieldPicker
                            fields={candidates}
                            getTileCount={getTileCount}
                            lockedKind={kind}
                            openOnMount
                            onPickField={(field) => {
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
                                if (!getFilterFields(next).includes(fieldId))
                                    addWaitingField(fieldId);
                                setHighlightedFieldId(fieldId);
                                setIsAdding(false);
                            }}
                        />
                    </Box>
                )}
            </Stack>
        </Stack>
    );
};
