import { useContext } from 'react';
import { MergeContext, type MergeContextValue } from './context';

export const useMerge = (): MergeContextValue => {
    const context = useContext(MergeContext);
    if (!context) {
        throw new Error('useMerge must be used within a MergeProvider');
    }
    return context;
};
