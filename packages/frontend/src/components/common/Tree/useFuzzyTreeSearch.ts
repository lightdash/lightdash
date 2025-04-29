import { useMemo } from 'react';
import useFuzzySearch from '../../../hooks/useFuzzySearch';
import { type NestableItem } from './types';

type FuzzySearchItem<T> = T & {
    filteredBy: 'match' | 'parent';
};

function useFuzzyTreeSearch<T extends NestableItem>(
    items: T[],
    query: string,
): FuzzySearchItem<T>[] {
    const [matchedItems] = useFuzzySearch(items, ['name'], query, {
        threshold: 0.3,
    });

    const filteredItems = useMemo<FuzzySearchItem<T>[]>(() => {
        return items
            .map<T | FuzzySearchItem<T>>((item) => {
                if (matchedItems.includes(item)) {
                    return {
                        ...item,
                        filteredBy: 'match',
                    };
                } else if (
                    matchedItems.some((matchedItem) =>
                        matchedItem.path.startsWith(item.path),
                    )
                ) {
                    return {
                        ...item,
                        filteredBy: 'parent',
                    };
                } else {
                    return item;
                }
            })
            .filter((item) => 'filteredBy' in item);
    }, [matchedItems, items]);

    return filteredItems;
}

export default useFuzzyTreeSearch;
