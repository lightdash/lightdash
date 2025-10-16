import { createContext, memo, useMemo, useState } from 'react';
import type { Filters } from '@lightdash/common';
import { useProcessedFiltersWorker } from '../../../hooks/useProcessedFiltersWorker';
import { selectFilters, selectTableName, useExplorerSelector } from '../../../features/explorer/store';
import { useExplore } from '../../../hooks/useExplore';

export type ProcessedFiltersContextValue = {
    processedFilters: Filters | null;
    isProcessing: boolean;
};

export const ProcessedFiltersContext = createContext<ProcessedFiltersContextValue | null>(null);

const ProcessedFiltersProviderComponent = memo<{ children: React.ReactNode }>(({ children }) => {
    const filters = useExplorerSelector(selectFilters);
    const tableName = useExplorerSelector(selectTableName);
    const { data: exploreData } = useExplore(tableName);
    const [hasDefaultFiltersApplied] = useState(false);

    const workerInput = useMemo(
        () => ({
            filters,
            exploreData,
            tableName,
            hasDefaultFiltersApplied,
        }),
        [filters, exploreData, tableName, hasDefaultFiltersApplied],
    );

    const { processedFilters, isProcessing } = useProcessedFiltersWorker(workerInput, true);

    const value = useMemo(
        () => ({
            processedFilters,
            isProcessing,
        }),
        [processedFilters, isProcessing],
    );

    return (
        <ProcessedFiltersContext.Provider value={value}>
            {children}
        </ProcessedFiltersContext.Provider>
    );
});

ProcessedFiltersProviderComponent.displayName = 'ProcessedFiltersProvider';

export const ProcessedFiltersProvider = ProcessedFiltersProviderComponent;
