import { createContext } from 'use-context-selector';
import { type DashboardContextType } from './types';

const DashboardContext = createContext<DashboardContextType | undefined>(
    undefined,
);

export default DashboardContext;
