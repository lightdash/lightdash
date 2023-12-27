import { useContext } from 'react';
import { Context, ContextType } from '.';

export const useActiveJob = (): ContextType => {
    const context = useContext(Context);
    if (context === undefined) {
        throw new Error('useActiveJob must be used within a ActiveJobProvider');
    }
    return context;
};
