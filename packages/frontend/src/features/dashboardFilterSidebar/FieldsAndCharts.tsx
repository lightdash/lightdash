import {
    getFilterTypeFromItemType,
    getItemId,
    isDashboardFieldTarget,
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Button, Stack, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { getFieldDisplayLabel } from './fieldGrains';
import { FieldPicker } from './FieldPicker';
import { FieldRow } from './FieldRow';
import {
    applyFieldToAll,
    getFieldCount,
    getFilterFields,
    removeField,
    removeFieldFromAll,
} from './peers';
import { useFilterSidebar } from './useFilterSidebar';

const DEFAULT_HINT = 'Choose which field each chart is filtered by.';

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
        listedFieldIds,
        listFieldId,
        unlistFieldId,
        clearFields,
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
        const targetFilterType =
            targetFieldType === null
                ? null
                : getFilterTypeFromItemType(targetFieldType);
        return (allFilterableFields ?? []).filter((field) => {
            const fieldId = getItemId(field);
            return (
                !fieldIds.includes(fieldId) &&
                waitingField?.fieldId !== fieldId &&
                (targetFilterType === null ||
                    getFilterTypeFromItemType(field.type) === targetFilterType)
            );
        });
    }, [allFilterableFields, fieldIds, waitingField, targetFieldType]);

    const [isAdding, setIsAdding] = useState(false);

    if (editingRule === null) return null;
    const getField = (fieldId: string): DashboardFilterableField | null =>
        allFilterableFieldsMap[fieldId] ?? null;

    const toggleHighlight = (fieldId: string) =>
        setHighlightedFieldId(highlightedFieldId === fieldId ? null : fieldId);

    const clearHighlight = (fieldId: string) => {
        if (highlightedFieldId === fieldId) setHighlightedFieldId(null);
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
                    <Text fz="sm" fw={600}>
                        Fields in this filter
                    </Text>
                    <Text fz="xs" c="dimmed">
                        {waitingLabel === null
                            ? DEFAULT_HINT
                            : `Not added yet. Click the dashed "+ ${waitingLabel}" on a chart, or All, to add it to this filter.`}
                    </Text>
                </Stack>
                {fieldIds.map((fieldId) => {
                    const field = getField(fieldId);
                    const count = getFieldCount(
                        editingRule,
                        fieldId,
                        tiles,
                        filterableFieldsByTileUuid,
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
                            label={getRowLabel(fieldId)}
                            tableLabel={
                                field?.tableLabel ?? target?.tableName ?? ''
                            }
                            count={count}
                            isWaiting={false}
                            isHighlighted={highlightedFieldId === fieldId}
                            isNotSaved={!isTarget && count.applied === 0}
                            onToggleHighlight={() => toggleHighlight(fieldId)}
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
            <Stack gap="xs" align="flex-start">
                <Button
                    variant="light"
                    size="xs"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    onClick={() => setIsAdding((open) => !open)}
                >
                    Add a field
                </Button>
                {isAdding && (
                    <FieldPicker
                        fields={candidates}
                        mode="single"
                        chosen={[]}
                        kind={null}
                        onKindChange={() => undefined}
                        lockedKind={
                            targetFieldType === null
                                ? undefined
                                : getFilterTypeFromItemType(targetFieldType)
                        }
                        onToggle={(field) => {
                            setWaitingField({
                                fieldId: getItemId(field),
                                tableName: field.table,
                            });
                            setIsAdding(false);
                        }}
                        getChartCount={(field) =>
                            getFieldCount(
                                editingRule,
                                getItemId(field),
                                tiles,
                                filterableFieldsByTileUuid,
                            ).possible
                        }
                    />
                )}
            </Stack>
        </Stack>
    );
};
