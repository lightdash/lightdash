import { createContext } from 'react';
import { type TrackingContextType } from './types';

const TrackingContext = createContext<TrackingContextType>(undefined as any);

export default TrackingContext;
