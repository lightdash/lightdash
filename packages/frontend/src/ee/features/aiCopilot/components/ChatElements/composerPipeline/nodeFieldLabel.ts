import {
    friendlyName,
    getItemLabelWithoutTableName,
    type ItemsMap,
} from '@lightdash/common';

export const nodeFieldLabel = (fieldsMap: ItemsMap, fieldId: string) => {
    const item = fieldsMap[fieldId];
    return item ? getItemLabelWithoutTableName(item) : friendlyName(fieldId);
};
