import { useContext } from 'react';
import { ProcessedFiltersContext } from './ProcessedFiltersContext';

export const useProcessedFilters = () => {
    const context = useContext(ProcessedFiltersContext);
    if (!context) {
        throw new Error('useProcessedFilters must be used within ProcessedFiltersProvider');
    }
    return context;
};
