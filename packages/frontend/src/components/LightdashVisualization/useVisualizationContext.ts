import { useContext } from 'react';
import Context from './context';

export function useVisualizationContext() {
    const context = useContext(Context);
    if (context === undefined) {
        throw new Error(
            'useVisualizationContext must be used within a VisualizationProvider',
        );
    }
    return context;
}
