import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import type { Filter } from '@lightdash/query-sdk';

export type ScopedFilter = Filter & { explore: string };

type FilterContextValue = {
    addFilter: (filter: ScopedFilter) => void;
    removeFilter: (filter: ScopedFilter) => void;
    clearFilters: () => void;
    filtersFor: (explore: string) => Filter[];
    allFilters: ScopedFilter[];
};

const FilterContext = createContext<FilterContextValue | null>(null);

const sameTarget = (a: ScopedFilter, b: ScopedFilter) =>
    a.explore === b.explore &&
    a.field === b.field &&
    JSON.stringify(a.value) === JSON.stringify(b.value);

export function FilterProvider({ children }: { children: ReactNode }) {
    const [filters, setFilters] = useState<ScopedFilter[]>([]);

    const addFilter = useCallback((filter: ScopedFilter) => {
        setFilters((prev) => {
            const exists = prev.some((f) => sameTarget(f, filter));
            return exists
                ? prev.filter((f) => !sameTarget(f, filter))
                : [...prev, filter];
        });
    }, []);

    const removeFilter = useCallback((filter: ScopedFilter) => {
        setFilters((prev) => prev.filter((f) => !sameTarget(f, filter)));
    }, []);

    const clearFilters = useCallback(() => setFilters([]), []);

    const filtersFor = useCallback(
        (explore: string): Filter[] =>
            filters
                .filter((f) => f.explore === explore)
                .map(({ explore: _e, ...rest }) => rest),
        [filters],
    );

    const value = useMemo(
        () => ({
            addFilter,
            removeFilter,
            clearFilters,
            filtersFor,
            allFilters: filters,
        }),
        [addFilter, removeFilter, clearFilters, filtersFor, filters],
    );

    return (
        <FilterContext.Provider value={value}>
            {children}
        </FilterContext.Provider>
    );
}

export function useGlobalFilters() {
    const ctx = useContext(FilterContext);
    if (!ctx) {
        throw new Error('useGlobalFilters must be used inside FilterProvider');
    }
    return ctx;
}
