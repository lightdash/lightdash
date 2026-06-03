import { friendlyName, isField, type ItemsMap } from '@lightdash/common';
import { getItemLabelWithoutTableName } from '@lightdash/common';

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
