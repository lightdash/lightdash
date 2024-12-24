import { useContext } from 'react';
import Context, { type DefaultFieldsMap, type FiltersContext } from './context';

function useFiltersContext<
    T extends DefaultFieldsMap = DefaultFieldsMap,
>(): FiltersContext<T> {
    const context = useContext(
        Context as React.Context<FiltersContext<T> | undefined>,
    );
    if (context === undefined) {
        throw new Error(
            'useFiltersContext must be used within a FiltersProvider',
        );
    }
    return context;
}

export default useFiltersContext;
