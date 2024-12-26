import { useContext } from 'react';
import TrackingContext from './context';
import { type TrackingContextType } from './types';

function useTracking<S extends boolean = false>(
    failSilently?: S,
): S extends false ? TrackingContextType : TrackingContextType | undefined {
    const context = useContext(TrackingContext);

    if (context === undefined && failSilently !== true) {
        throw new Error('useTracking must be used within a TrackingProvider');
    }

    return context;
}

export default useTracking;
