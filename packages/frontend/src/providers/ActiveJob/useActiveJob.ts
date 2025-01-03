import { useContext } from 'react';
import Context from './context';
import { type ContextType } from './types';

function useActiveJob(): ContextType {
    const context = useContext(Context);
    if (context === undefined) {
        throw new Error('useActiveJob must be used within a ActiveJobProvider');
    }
    return context;
}

export default useActiveJob;
