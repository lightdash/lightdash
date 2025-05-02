import Fuse from 'fuse.js';
import { useMemo } from 'react';

export type FuzzyMatches<T> = T & {
    _fuzzyMatches: string[];
};

function useFuzzySearch<T>(
    list: T[],
    keys: Required<Fuse.IFuseOptions<T>['keys']>,
    query: string,
    options?: Omit<Fuse.IFuseOptions<T>, 'keys'>,
): FuzzyMatches<T>[] | undefined {
    const fuse = useMemo(() => {
        return new Fuse(list, { ...options, keys });
    }, [list, options, keys]);

    const searchResults = useMemo(() => {
        if (query !== '') {
            return fuse.search(query);
        }
    }, [fuse, query]);

    const items = useMemo(() => {
        if (!searchResults) return;

        return searchResults.map<FuzzyMatches<T>>((r) => {
            return {
                ...r.item,
                _fuzzyMatches:
                    r.matches
                        ?.flatMap((m) => {
                            return m.indices
                                .map(([start, end]) => {
                                    return m.value?.slice(start, end + 1);
                                })
                                .filter((s) => {
                                    return s !== '';
                                });
                        })
                        .filter((v) => {
                            return typeof v === 'string';
                        }) ?? [],
            };
        });
    }, [searchResults]);

    return items;
}

export default useFuzzySearch;
