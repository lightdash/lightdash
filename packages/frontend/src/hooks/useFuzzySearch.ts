import Fuse from 'fuse.js';
import { useMemo } from 'react';

function useFuzzySearch<T>(
    list: T[],
    keys: Required<Fuse.IFuseOptions<T>['keys']>,
    query: string,
    options?: Omit<Fuse.IFuseOptions<T>, 'keys'>,
) {
    const fuse = useMemo(() => {
        return new Fuse(list, { ...options, keys });
    }, [list, options, keys]);

    const searchResults = useMemo(() => {
        if (query !== '') {
            return fuse.search(query);
        }
    }, [fuse, query]);

    const items = useMemo(() => {
        if (searchResults) {
            return searchResults.map((r) => r.item);
        }
    }, [searchResults]);

    return [items] as const;
}

export default useFuzzySearch;
