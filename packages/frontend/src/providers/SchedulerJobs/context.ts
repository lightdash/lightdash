import { createContext } from 'react';
import { type SchedulerJobsContextType } from './types';

const SchedulerJobsContext = createContext<SchedulerJobsContextType>(
    undefined as any,
);

export default SchedulerJobsContext;
