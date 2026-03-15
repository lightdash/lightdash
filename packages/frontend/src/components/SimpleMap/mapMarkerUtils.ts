import type { TooltipFieldInfo } from '../../hooks/leaflet/useLeafletMapConfig';

// Helper to get formatted value from row data
export const getFormattedValue = (
    rowData: Record<string, any>,
    fieldId: string,
): string => {
    const field = rowData[fieldId];
    if (!field) return '';
    return field.value?.formatted ?? field.value?.raw ?? '';
};

export const getCopyValue = (
    tooltipFields: TooltipFieldInfo[],
    rowData: Record<string, any>,
): string => {
    const visibleFields = tooltipFields.filter((f) => f.visible);
    if (visibleFields.length === 0) return '';
    if (visibleFields.length === 1)
        return getFormattedValue(rowData, visibleFields[0].fieldId);
    return visibleFields
        .map((field) => getFormattedValue(rowData, field.fieldId))
        .join(', ');
};
