import { useContext } from 'react';
import { Context, TableTreeContext } from '.';

export function useTableTreeContext(): TableTreeContext {
    const context = useContext(Context);
    if (context === undefined) {
        throw new Error(
            'useTableTreeContext must be used within a TableTreeProvider',
        );
    }
    return context;
}
