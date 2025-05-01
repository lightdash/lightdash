import { useMemo } from 'react';
import useFuzzySearch, {
    type FuzzyMatches,
} from '../../../hooks/useFuzzySearch';
import { type NestableItem } from './types';

export type FuzzyFilteredItem<T> = T & {
    _fuzzyFilteredBy: 'match' | 'parent';
};

function useFuzzyTreeSearch<T extends NestableItem>(items: T[], query: string) {
    const matchedItems = useFuzzySearch(items, ['name'], query, {
        threshold: 0.3,
        shouldSort: false,
        includeMatches: true,
    });

    const filteredItems = useMemo(() => {
        if (!matchedItems) return;

        return items
            .map<
                | FuzzyFilteredItem<T>
                | FuzzyFilteredItem<FuzzyMatches<T>>
                | undefined
            >((item) => {
                const matchedItem = matchedItems.find(
                    (m) => m.path === item.path,
                );
                const isParentMatch = matchedItems.some((m) =>
                    m.path.startsWith(item.path),
                );

                if (matchedItem) {
                    return {
                        ...matchedItem,
                        _fuzzyFilteredBy: 'match',
                    };
                } else if (isParentMatch) {
                    return {
                        ...item,
                        _fuzzyFilteredBy: 'parent',
                    };
                } else {
                    return undefined;
                }
            })
            .filter((item) => item !== undefined);
    }, [matchedItems, items]);

    return filteredItems;
}

export default useFuzzyTreeSearch;
