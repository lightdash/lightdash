import { createContext } from 'react';
import { type FunnelDetailsVariant } from './funnelNodeLabels';

/** Picks the funnel lineage cell layout; only stories set it. */
export const FunnelDetailsVariantContext =
    createContext<FunnelDetailsVariant>('rows');
