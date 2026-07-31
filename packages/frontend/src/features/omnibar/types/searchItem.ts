import { SearchItemType, type SearchResult } from '@lightdash/common';
import { type Icon as TablerIcon } from '@tabler/icons-react';

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
    SearchItemType.SETTINGS,
];

export type SearchItem = {
    type: SearchItemType;
    typeLabel?: 'Table' | 'Joined table' | 'Dimension' | 'Metric';
    title: string;
    prefix?: string;
    contextLabel?: string;
    icon?: TablerIcon;
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

/** A labelled section of omnibar rows — search-result type groups and the
 * recently-viewed section share this shape so keyboard navigation, hover
 * focus and the preview panel behave identically for both. Collapsed groups
 * keep `items` empty (so keyboard nav skips them) while `totalCount` still
 * reports how many results the section holds. */
export type OmnibarGroup = {
    key: string;
    label: string;
    items: SearchItem[];
    totalCount: number;
    collapsed: boolean;
};
