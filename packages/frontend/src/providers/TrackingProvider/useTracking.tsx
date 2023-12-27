import { useContext } from 'react';
import { Context, TrackingContext } from '.';

export function useTracking<S extends boolean = false>(
    failSilently?: S,
): S extends false ? TrackingContext : TrackingContext | undefined {
    const context = useContext(Context);

    if (context === undefined && failSilently !== true) {
        throw new Error('useTracking must be used within a TrackingProvider');
    }

    return context;
}
