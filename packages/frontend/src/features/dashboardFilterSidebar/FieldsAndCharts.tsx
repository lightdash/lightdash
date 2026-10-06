import {
    getFilterTypeFromItemType,
    getItemId,
    isDashboardFieldTarget,
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { useMemo, type FC } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
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

const DEFAULT_HINT =
    'Click a chart to change what it uses. Pick a row to see which charts use it.';

const pluralizeCharts = (count: number): string =>
    count === 1 ? 'chart' : 'charts';

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

    if (editingRule === null) return null;

    const getField = (fieldId: string): DashboardFilterableField | null =>
        allFilterableFieldsMap[fieldId] ?? null;

    const toggleHighlight = (fieldId: string) =>
        setHighlightedFieldId(highlightedFieldId === fieldId ? null : fieldId);

    const clearHighlight = (fieldId: string) => {
        if (highlightedFieldId === fieldId) setHighlightedFieldId(null);
    };

    const hasSavedPeer = getFilterFields(editingRule, []).length > 1;
    const waitingRow =
        waitingField !== null && !fieldIds.includes(waitingField.fieldId)
            ? waitingField
            : null;
    const waitingLabel =
        waitingRow === null
            ? null
            : (getField(waitingRow.fieldId)?.label ?? waitingRow.fieldId);

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
                            label={field?.label ?? fieldId}
                            tableLabel={
                                field?.tableLabel ?? target?.tableName ?? ''
                            }
                            count={count}
                            isWaiting={false}
                            isHighlighted={highlightedFieldId === fieldId}
                            isNotSaved={!isTarget && count.applied === 0}
                            canRemove={
                                fieldIds.length > 1 &&
                                (!isTarget || hasSavedPeer)
                            }
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
                        canRemove
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
            <Stack gap="xs">
                <Text fz="sm" fw={600}>
                    Add a field
                </Text>
                <FieldPicker
                    fields={candidates}
                    onPick={(field) =>
                        setWaitingField({
                            fieldId: getItemId(field),
                            tableName: field.table,
                        })
                    }
                    getSubLabel={(field) => {
                        const { possible } = getFieldCount(
                            editingRule,
                            getItemId(field),
                            tiles,
                            filterableFieldsByTileUuid,
                        );
                        return `${field.tableLabel ?? field.table} · ${possible} ${pluralizeCharts(possible)}`;
                    }}
                />
            </Stack>
        </Stack>
    );
};
