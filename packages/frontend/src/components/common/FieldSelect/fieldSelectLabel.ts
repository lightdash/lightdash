import {
    getItemLabel,
    getItemLabelWithoutTableName,
    type Item,
} from '@lightdash/common';

/** An item's label in the field select: with its table unless grouped by table. */
export const getFieldSelectLabel = (item: Item, hasGrouping: boolean) => {
    return hasGrouping
        ? getItemLabelWithoutTableName(item)
        : getItemLabel(item);
};
