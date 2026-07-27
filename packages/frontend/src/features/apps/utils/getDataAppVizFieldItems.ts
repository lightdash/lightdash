import {
    getDimensionsFromItemsMap,
    getMetricsFromItemsMap,
    getTableCalculationsFromItemsMap,
    isField,
    type Item,
    type ItemsMap,
} from '@lightdash/common';

const isVisibleField = (item: Item): boolean => !isField(item) || !item.hidden;

export const getDataAppVizFieldItems = (itemsMap: ItemsMap) => ({
    dimensions: Object.values(getDimensionsFromItemsMap(itemsMap)).filter(
        isVisibleField,
    ),
    metrics: [
        ...Object.values(getMetricsFromItemsMap(itemsMap, isVisibleField)),
        ...Object.values(getTableCalculationsFromItemsMap(itemsMap)),
    ],
});
