import {
    type FocusedItemIndex,
    type OmnibarGroup,
    type SearchItem,
} from '../types/searchItem';

export const getOmnibarItemKey = (item: SearchItem): string =>
    JSON.stringify([item.type, item.location.pathname, item.location.search]);

export const getFocusedItemIndex = (
    groups: OmnibarGroup[],
    itemKey: string,
): FocusedItemIndex | undefined => {
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
        const itemIndex = groups[groupIndex].items.findIndex(
            (item) => getOmnibarItemKey(item) === itemKey,
        );
        if (itemIndex !== -1) return { groupIndex, itemIndex };
    }
    return undefined;
};
