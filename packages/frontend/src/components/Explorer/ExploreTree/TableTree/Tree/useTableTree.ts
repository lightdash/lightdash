import { useContext } from 'react';
import TreeContext from './TreeContext';
import { type TableTreeContext } from './types';

export function useTableTreeContext(): TableTreeContext {
    const context = useContext(TreeContext);
    if (context === undefined) {
        throw new Error(
            'useTableTreeContext must be used within a TableTreeProvider',
        );
    }
    return context;
}
