import { assertUnreachable } from '@lightdash/common';
import { SearchItemType } from './../types/searchItem';

export const getSearchItemLabel = (itemType: SearchItemType) => {
    switch (itemType) {
        case SearchItemType.FIELD:
            return 'Fields';
        case SearchItemType.DASHBOARD:
            return 'Dashboards';
        case SearchItemType.SAVED_CHART:
            return 'Charts';
        case SearchItemType.SPACE:
            return 'Spaces';
        case SearchItemType.TABLE:
            return 'Tables';
        case SearchItemType.PAGE:
            return 'Pages';
        default:
            return assertUnreachable(
                itemType,
                `Unknown search item type: ${itemType}`,
            );
    }
};

export const getSearchItemErrorLabel = (itemType: SearchItemType) => {
    switch (itemType) {
        case SearchItemType.FIELD:
            return 'field';
        case SearchItemType.DASHBOARD:
            return 'dashboard';
        case SearchItemType.SAVED_CHART:
            return 'chart';
        case SearchItemType.SPACE:
        case SearchItemType.TABLE:
        case SearchItemType.PAGE:
        default:
            return new Error(`Unknown error item type: ${itemType}`);
    }
};
