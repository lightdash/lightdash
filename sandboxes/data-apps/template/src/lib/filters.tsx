import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    type ReactNode,
} from 'react';
import { useUrlState, type Filter } from '@lightdash/query-sdk';

export type ScopedFilter = Filter & { explore: string };

// Global filters live in URL state so the host page's address bar is always a
// shareable link to the current filtered view. The seeded value comes from a
// user-editable URL — sanitize before trusting its shape, or malformed
// entries flow into every metric query for the explore and fail the run.
const isScalar = (v: unknown): v is string | number | boolean =>
    typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

const sanitizeFilters = (value: unknown): ScopedFilter[] =>
    Array.isArray(value)
        ? value.filter((f): f is ScopedFilter => {
              if (!f || typeof f !== 'object') return false;
              const { explore, field, operator, value: filterValue } =
                  f as ScopedFilter;
              return (
                  typeof explore === 'string' &&
                  typeof field === 'string' &&
                  typeof operator === 'string' &&
                  operator.length > 0 &&
                  (filterValue === undefined ||
                      isScalar(filterValue) ||
                      (Array.isArray(filterValue) &&
                          filterValue.every(isScalar)))
              );
          })
        : [];

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
    const [rawFilters, setFilters] = useUrlState<ScopedFilter[]>(
        'globalFilters',
        [],
    );
    const filters = useMemo(() => sanitizeFilters(rawFilters), [rawFilters]);

    const addFilter = useCallback(
        (filter: ScopedFilter) => {
            setFilters((prev) => {
                const current = sanitizeFilters(prev);
                const exists = current.some((f) => sameTarget(f, filter));
                return exists
                    ? current.filter((f) => !sameTarget(f, filter))
                    : [...current, filter];
            });
        },
        [setFilters],
    );

    const removeFilter = useCallback(
        (filter: ScopedFilter) => {
            setFilters((prev) =>
                sanitizeFilters(prev).filter((f) => !sameTarget(f, filter)),
            );
        },
        [setFilters],
    );

    const clearFilters = useCallback(() => setFilters([]), [setFilters]);

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
