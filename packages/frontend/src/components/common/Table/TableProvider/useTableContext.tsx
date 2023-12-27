import { useContext } from 'react';
import { Context, TableContext } from '../TableProvider';

export function useTableContext(): TableContext {
    const context = useContext(Context);
    if (context === undefined) {
        throw new Error('useTableContext must be used within a TableProvider');
    }
    return context;
}
