import { createContext } from 'react';
import { type PillDragHandle } from '../dashboardFilters/ActiveFilters/FilterPillButton';

/** The grip of the pill inside a draggable: the only place a drag starts. */
export const PillDragHandleContext = createContext<PillDragHandle | null>(null);
