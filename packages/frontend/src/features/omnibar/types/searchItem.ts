import { SearchItemType, type SearchResult } from '@lightdash/common';

// Display order for the omnibar's "Item type" filter dropdown.
// Data apps slot just above Spaces so they sit alongside the other
// "container" content types (spaces) rather than at the bottom.
export const allSearchItemTypes: SearchItemType[] = [
    SearchItemType.DASHBOARD,
    SearchItemType.DASHBOARD_TAB,
    SearchItemType.CHART,
    SearchItemType.SQL_CHART,
    SearchItemType.DATA_APP,
    SearchItemType.SPACE,
    SearchItemType.TABLE,
    SearchItemType.FIELD,
    SearchItemType.PAGE,
];

export type SearchItem = {
    type: SearchItemType;
    typeLabel?: 'Table' | 'Joined table' | 'Dimension' | 'Metric';
    title: string;
    prefix?: string;
    description?: string;
    location: { pathname: string; search?: string };
    item?: SearchResult;
    searchRank?: number;
    slug?: string;
};

export type FocusedItemIndex = {
    groupIndex: number;
    itemIndex: number;
};
