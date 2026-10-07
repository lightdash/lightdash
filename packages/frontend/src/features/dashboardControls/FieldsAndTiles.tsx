import { getItemId, type DashboardFilterableField } from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { useCallback, useMemo, type FC } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { getFieldDisplayLabel } from './fieldGrains';
import { FieldPicker } from './FieldPicker';
import { FieldRow } from './FieldRow';
import { useControlsSidebar } from './useControlsSidebar';

export const FieldsAndTiles: FC = () => {
    const { editingRule, isPlaceholder, addFirstField } = useControlsSidebar();
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const allFilterableFields = useDashboardContext(
        (c) => c.allFilterableFields,
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );

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

    const { fieldId, tableName } = editingRule.target;
    const field = allFilterableFieldsMap[fieldId] ?? null;

    return (
        <Stack gap="xs">
            <Text fz="sm" fw={600}>
                Fields in this filter
            </Text>
            <FieldRow
                field={field}
                label={
                    field === null
                        ? fieldId
                        : getFieldDisplayLabel(field, fields)
                }
                tableLabel={field?.tableLabel ?? tableName}
            />
        </Stack>
    );
};
