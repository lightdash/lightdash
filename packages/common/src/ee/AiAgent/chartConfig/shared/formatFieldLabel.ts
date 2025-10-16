import { friendlyName, isField, type ItemsMap } from '../../../../types/field';
import { getItemLabelWithoutTableName } from '../../../../utils/item';

export const formatFieldLabel = (
    fieldId: string,
    fieldsMap: ItemsMap,
): string => {
    const field = fieldsMap[fieldId];
    if (field && isField(field)) {
        return getItemLabelWithoutTableName(field);
    }
    return friendlyName(fieldId);
};
