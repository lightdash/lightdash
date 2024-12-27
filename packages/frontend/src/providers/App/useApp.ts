import { useContext } from 'react';
import AppProviderContext from './context';
import { type AppContext } from './types';

function useApp(): AppContext {
    const context = useContext(AppProviderContext);
    if (context === undefined) {
        throw new Error('useApp must be used within a AppProvider');
    }
    return context;
}

export default useApp;
