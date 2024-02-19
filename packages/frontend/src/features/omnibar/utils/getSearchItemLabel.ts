import { assertUnreachable } from '@lightdash/common';
import { SearchItem } from './../types/searchItem';

export const getSearchItemLabel = (item: SearchItem) => {
    switch (item.type) {
        case 'field':
            return 'Field';
        case 'dashboard':
            return 'Dashboard';
        case 'saved_chart':
            return 'Chart';
        case 'space':
            return 'Space';
        case 'table':
            return 'Table';
        case 'page':
            return 'Page';
        default:
            return assertUnreachable(
                item.type,
                `Unknown search item type: ${item.type}`,
            );
    }
};
