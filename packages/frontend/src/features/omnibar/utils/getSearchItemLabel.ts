import { assertUnreachable } from '@lightdash/common';
import { SearchItem } from './../types/searchItem';

export const getSearchItemLabel = (itemType: SearchItem['type']) => {
    switch (itemType) {
        case 'field':
            return 'Fields';
        case 'dashboard':
            return 'Dashboards';
        case 'saved_chart':
            return 'Charts';
        case 'space':
            return 'Spaces';
        case 'table':
            return 'Tables';
        case 'page':
            return 'Pages';
        default:
            return assertUnreachable(
                itemType,
                `Unknown search item type: ${itemType}`,
            );
    }
};
