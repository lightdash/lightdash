import {
    getItemLabelWithoutTableName,
    isAdditionalMetric,
    isCustomDimension,
    isField,
} from '@lightdash/common';
import { type FieldSuggestionItem } from '../../../components/common/SuggestionList';
import { type MergeResults } from '../context/context';

export const getMergeTableCalculationSuggestions = (
    result: Pick<
        MergeResults,
        'columnOrder' | 'fields' | 'fieldOrigins'
    > | null,
): FieldSuggestionItem[] => {
    if (!result) return [];

    return result.columnOrder.flatMap((fieldId) => {
        const item = result.fields[fieldId];
        const origin = result.fieldOrigins[fieldId];
        if (
            !item ||
            origin?.kind === 'tableCalculation' ||
            (!isField(item) &&
                !isAdditionalMetric(item) &&
                !isCustomDimension(item))
        ) {
            return [];
        }

        const label = getItemLabelWithoutTableName(item);
        return [
            {
                id: fieldId,
                label:
                    origin?.kind === 'source' && isField(item)
                        ? `${item.tableLabel} · ${label}`
                        : label,
                item,
            },
        ];
    });
};
