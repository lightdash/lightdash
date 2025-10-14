import {
    NotImplementedError,
    TableCalculationTemplateType,
    assertUnreachable,
    getItemId,
    type Field,
    type SortField,
    type TableCalculationTemplate,
} from '@lightdash/common';

interface QuickCalculationConfig {
    type: TableCalculationTemplateType;
    field: Field;
    name: string;
    displayName: string;
}

function mapSortsToOrderBy(sorts: SortField[]): {
    fieldId: string;
    order: 'asc' | 'desc' | null;
}[] {
    if (!sorts || sorts.length === 0) return [];

    return sorts.map((sort) => ({
        fieldId: sort.fieldId,
        order: (sort.descending ? 'asc' : 'desc') as 'asc' | 'desc',
    }));
}

export function generateTableCalculationTemplate(
    config: QuickCalculationConfig,
    currentSorts: SortField[],
): TableCalculationTemplate {
    const { type, field } = config;
    const fieldId = getItemId(field);

    switch (type) {
        case TableCalculationTemplateType.PERCENT_CHANGE_FROM_PREVIOUS:
            return {
                type: TableCalculationTemplateType.PERCENT_CHANGE_FROM_PREVIOUS,
                fieldId,
                orderBy: mapSortsToOrderBy(currentSorts),
            };

        case TableCalculationTemplateType.PERCENT_OF_PREVIOUS_VALUE:
            return {
                type: TableCalculationTemplateType.PERCENT_OF_PREVIOUS_VALUE,
                fieldId,
                orderBy: mapSortsToOrderBy(currentSorts),
            };

        case TableCalculationTemplateType.RUNNING_TOTAL:
            return {
                type: TableCalculationTemplateType.RUNNING_TOTAL,
                fieldId,
            };

        case TableCalculationTemplateType.PERCENT_OF_COLUMN_TOTAL:
            return {
                type: TableCalculationTemplateType.PERCENT_OF_COLUMN_TOTAL,
                fieldId,
                partitionBy: [],
            };

        case TableCalculationTemplateType.RANK_IN_COLUMN:
            return {
                type: TableCalculationTemplateType.RANK_IN_COLUMN,
                fieldId,
            };

        case TableCalculationTemplateType.WINDOW_FUNCTION:
            // Window functions are not available in quick calculations
            // This case should never be reached, but is required for type safety
            throw new NotImplementedError(
                'Generic window functions are not available in quick calculations',
            );

        default:
            return assertUnreachable(type, `Unknown template type`);
    }
}
