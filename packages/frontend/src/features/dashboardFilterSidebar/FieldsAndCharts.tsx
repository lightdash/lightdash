import {
    FilterType,
    getFilterTypeFromItemType,
    getItemId,
    isDimension,
    isDashboardFieldTarget,
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Box, Button, Stack, Text, Tooltip } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { getFieldDisplayLabel } from './fieldGrains';
import { FIELD_KINDS, type PickableParameter } from './fieldKinds';
import { FieldPicker } from './FieldPicker';
import { FieldRow } from './FieldRow';
import classes from './FieldsAndCharts.module.css';
import {
    getFreeParameterKeys,
    getParameterKind,
    getParameterLabel,
    type ParameterKind,
} from './parameterControls';
import {
    applyFieldToAll,
    applyFieldToUnfilteredTiles,
    getFieldCount,
    getFilterFields,
    removeField,
    removeFieldFromAll,
} from './peers';
import { useFilterSidebar } from './useFilterSidebar';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

const DEFAULT_HINT = 'Choose which field each tile is filtered by.';

const getRuleFieldTarget = (
    rule: DashboardFilterRule,
    fieldId: string,
    field: DashboardFilterableField | null,
): DashboardFieldTarget | null => {
    if (rule.target.fieldId === fieldId) return rule.target;
    const peer = Object.values(rule.tileTargets ?? {})
        .filter(isDashboardFieldTarget)
        .find((target) => target.fieldId === fieldId);
    if (peer !== undefined) return peer;
    return field === null ? null : { fieldId, tableName: field.table };
};

export const FieldsAndCharts: FC = () => {
    const {
        editingRule,
        updateFilter,
        waitingField,
        setWaitingField,
        highlightedFieldId,
        setHighlightedFieldId,
        hoveredFieldId,
        setHoveredFieldId,
        listedFieldIds,
        listFieldId,
        unlistFieldId,
        clearFields,
        isUnplaced,
        addControl,
        removeFilterById,
        parameterControls,
        addFirstField,
    } = useFilterSidebar();
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

    const tiles = useMemo(() => dashboardTiles ?? [], [dashboardTiles]);
    const sqlColumnsByTile = useSqlColumnsByTile(editingRule);

    const fieldIds = useMemo(
        () =>
            editingRule === null
                ? []
                : getFilterFields(editingRule, listedFieldIds),
        [editingRule, listedFieldIds],
    );

    const targetFieldType =
        editingRule === null
            ? null
            : (allFilterableFieldsMap[editingRule.target.fieldId]?.type ??
              null);

    const candidates = useMemo(() => {
        // Unplaced: any kind until the first field is picked
        const targetFilterType = isUnplaced
            ? null
            : targetFieldType === null
              ? null
              : getFilterTypeFromItemType(targetFieldType);
        const fields = allFilterableFields ?? [];
        const taken = new Set([...fieldIds, waitingField?.fieldId]);
        // A time dimension is taken when any of its grains is in the filter
        const grainKey = (field: DashboardFilterableField) =>
            isDimension(field)
                ? `${field.table}.${field.timeIntervalBaseDimensionName ?? field.name}`
                : null;
        const takenGrainKeys = new Set(
            fields
                .filter((field) => taken.has(getItemId(field)))
                .map(grainKey)
                .filter((key): key is string => key !== null),
        );
        return fields.filter((field) => {
            const fieldId = getItemId(field);
            const key = grainKey(field);
            return (
                !taken.has(fieldId) &&
                (key === null || !takenGrainKeys.has(key)) &&
                (targetFilterType === null ||
                    getFilterTypeFromItemType(field.type) === targetFilterType)
            );
        });
    }, [
        allFilterableFields,
        fieldIds,
        waitingField,
        targetFieldType,
        isUnplaced,
    ]);

    const [isAdding, setIsAdding] = useState(false);
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );
    // Parameters no control overrides yet, one row per key with its chart count
    const pickableParameters = useMemo<PickableParameter[]>(() => {
        const kinds = FIELD_KINDS.filter(
            (item): item is ParameterKind => item !== FilterType.BOOLEAN,
        );
        return kinds.flatMap((parameterKind) =>
            getFreeParameterKeys(
                parameterKind,
                parameterControls,
                parameterDefinitions,
                tileParameterReferences,
            ).map((key) => ({
                key,
                label: getParameterLabel(key, parameterDefinitions),
                kind: parameterKind,
                chartCount: Object.values(tileParameterReferences).filter(
                    (keys) => keys.includes(key),
                ).length,
            })),
        );
    }, [parameterControls, parameterDefinitions, tileParameterReferences]);
    // A picked parameter replaces the placeholder with a parameter control
    const handlePickParameter = useCallback(
        (key: string) => {
            const definition = parameterDefinitions[key];
            if (definition === undefined || editingRule === null) return;
            removeFilterById(editingRule.id);
            addControl({
                id: uuidv4(),
                label: '',
                kind: getParameterKind(definition),
                parameterKeys: [key],
                tileTargets: {},
            });
        },
        [parameterDefinitions, editingRule, removeFilterById, addControl],
    );

    const getCandidateChartCount = useCallback(
        (field: DashboardFilterableField) =>
            editingRule === null
                ? 0
                : getFieldCount(
                      editingRule,
                      getItemId(field),
                      tiles,
                      filterableFieldsByTileUuid,
                      sqlColumnsByTile,
                  ).possible,
        [editingRule, tiles, filterableFieldsByTileUuid, sqlColumnsByTile],
    );

    if (editingRule === null) return null;
    const getField = (fieldId: string): DashboardFilterableField | null =>
        allFilterableFieldsMap[fieldId] ?? null;

    const toggleHighlight = (fieldId: string) =>
        setHighlightedFieldId(highlightedFieldId === fieldId ? null : fieldId);

    const clearHighlight = (fieldId: string) => {
        if (highlightedFieldId === fieldId) setHighlightedFieldId(null);
        if (hoveredFieldId === fieldId) setHoveredFieldId(null);
    };

    const hoverField = (fieldId: string, isHovered: boolean) => {
        if (isHovered) setHoveredFieldId(fieldId);
        else if (hoveredFieldId === fieldId) setHoveredFieldId(null);
    };

    const waitingRow =
        waitingField !== null && !fieldIds.includes(waitingField.fieldId)
            ? waitingField
            : null;

    // One name per field; a grain is shown only when two rows would collide
    const visibleFieldIds =
        waitingRow === null ? fieldIds : [...fieldIds, waitingRow.fieldId];
    const displayLabels = visibleFieldIds.map((fieldId) => {
        const field = getField(fieldId);
        return field
            ? getFieldDisplayLabel(field, allFilterableFields ?? [])
            : fieldId;
    });
    const getRowLabel = (fieldId: string): string => {
        const index = visibleFieldIds.indexOf(fieldId);
        const display = displayLabels[index] ?? fieldId;
        const isDuplicate =
            displayLabels.filter((label) => label === display).length > 1;
        return isDuplicate ? (getField(fieldId)?.label ?? fieldId) : display;
    };

    const waitingLabel =
        waitingRow === null ? null : getRowLabel(waitingRow.fieldId);

    return (
        <Stack gap="lg">
            <Stack gap="xs">
                <Stack gap={2}>
                    {!isUnplaced && (
                        <Text fz="sm" fw={600}>
                            Fields in this filter
                        </Text>
                    )}
                    <Text fz="xs" c="dimmed">
                        {isUnplaced
                            ? 'Select a field to filter or a parameter to control'
                            : waitingLabel === null
                              ? DEFAULT_HINT
                              : `Not added yet. Click the dashed "+ ${waitingLabel}" on a tile, or All, to add it to this filter.`}
                    </Text>
                </Stack>
                {fieldIds.map((fieldId) => {
                    const field = getField(fieldId);
                    const count = getFieldCount(
                        editingRule,
                        fieldId,
                        tiles,
                        filterableFieldsByTileUuid,
                        sqlColumnsByTile,
                    );
                    const isTarget = editingRule.target.fieldId === fieldId;
                    const target = getRuleFieldTarget(
                        editingRule,
                        fieldId,
                        field,
                    );
                    return (
                        <FieldRow
                            key={fieldId}
                            field={field ?? null}
                            label={getRowLabel(fieldId)}
                            tableLabel={
                                field?.tableLabel ?? target?.tableName ?? ''
                            }
                            count={count}
                            isWaiting={false}
                            isHighlighted={highlightedFieldId === fieldId}
                            isNotSaved={!isTarget && count.applied === 0}
                            onToggleHighlight={() => toggleHighlight(fieldId)}
                            onHoverChange={(isHovered) =>
                                hoverField(fieldId, isHovered)
                            }
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
                                listFieldId(fieldId);
                                updateFilter(
                                    removeFieldFromAll(
                                        editingRule,
                                        fieldId,
                                        tiles,
                                        filterableFieldsByTileUuid,
                                    ),
                                );
                            }}
                            onRemove={() => {
                                unlistFieldId(fieldId);
                                clearHighlight(fieldId);
                                // Last saved field: empty the filter instead
                                if (
                                    getFilterFields(editingRule, []).length <= 1
                                ) {
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
                            }}
                        />
                    );
                })}
                {waitingRow !== null && waitingLabel !== null && (
                    <FieldRow
                        field={getField(waitingRow.fieldId) ?? null}
                        label={waitingLabel}
                        tableLabel={
                            getField(waitingRow.fieldId)?.tableLabel ??
                            waitingRow.tableName
                        }
                        count={{
                            applied: 0,
                            possible: getFieldCount(
                                editingRule,
                                waitingRow.fieldId,
                                tiles,
                                filterableFieldsByTileUuid,
                                sqlColumnsByTile,
                            ).possible,
                        }}
                        isWaiting
                        isHighlighted={
                            highlightedFieldId === waitingRow.fieldId
                        }
                        isNotSaved={false}
                        onToggleHighlight={() =>
                            toggleHighlight(waitingRow.fieldId)
                        }
                        onHoverChange={(isHovered) =>
                            hoverField(waitingRow.fieldId, isHovered)
                        }
                        onAll={() => {
                            updateFilter(
                                applyFieldToAll(
                                    editingRule,
                                    waitingRow,
                                    tiles,
                                    filterableFieldsByTileUuid,
                                ),
                            );
                            setWaitingField(null);
                        }}
                        onNone={() => undefined}
                        onRemove={() => {
                            clearHighlight(waitingRow.fieldId);
                            setWaitingField(null);
                        }}
                    />
                )}
            </Stack>
            {isUnplaced ? (
                <FieldPicker
                    fields={candidates}
                    getChartCount={getCandidateChartCount}
                    parameters={pickableParameters}
                    onPickParameter={handlePickParameter}
                    onPickField={addFirstField}
                />
            ) : (
                <Stack gap="xs" align="flex-start">
                    <Tooltip
                        label="Every field of this kind is already in the filter"
                        disabled={candidates.length > 0}
                    >
                        <Button
                            variant="light"
                            size="xs"
                            leftSection={<MantineIcon icon={IconPlus} />}
                            onClick={() => setIsAdding((open) => !open)}
                            data-disabled={candidates.length === 0 || undefined}
                        >
                            Add a field
                        </Button>
                    </Tooltip>
                    {isAdding && candidates.length > 0 && (
                        <Box className={classes.addFieldSelect}>
                            <FieldPicker
                                fields={candidates}
                                getChartCount={getCandidateChartCount}
                                parameters={[]}
                                openOnMount
                                onPickField={(field) => {
                                    // The field joins the filter at once and
                                    // takes the tiles nothing else reaches yet
                                    const fieldId = getItemId(field);
                                    listFieldId(fieldId);
                                    updateFilter(
                                        applyFieldToUnfilteredTiles(
                                            editingRule,
                                            {
                                                fieldId,
                                                tableName: field.table,
                                            },
                                            tiles,
                                            filterableFieldsByTileUuid,
                                            sqlColumnsByTile,
                                        ),
                                    );
                                    setIsAdding(false);
                                }}
                            />
                        </Box>
                    )}
                </Stack>
            )}
        </Stack>
    );
};
