import {
    AdditionalMetric,
    CustomDimension,
    Dimension,
    Metric,
} from '@lightdash/common';
import Fuse from 'fuse.js';

export const getSearchResults = (
    itemsMap: Record<
        string,
        Dimension | Metric | AdditionalMetric | CustomDimension
    >,
    searchQuery?: string,
): Set<string> => {
    const results = new Set<string>();
    if (searchQuery && searchQuery !== '') {
        new Fuse(Object.entries(itemsMap), {
            keys: ['1.label', '1.groupLabel'],
            ignoreLocation: true,
            threshold: 0.3,
        })
            .search(searchQuery)
            .forEach((res) => results.add(res.item[0]));
    }
    return results;
};
