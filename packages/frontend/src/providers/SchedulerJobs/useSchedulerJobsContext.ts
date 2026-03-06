import { useContext } from 'react';
import SchedulerJobsContext from './context';
import { type SchedulerJobsContextType } from './types';

function useSchedulerJobsContext(): SchedulerJobsContextType {
    const context = useContext(SchedulerJobsContext);
    if (context === undefined) {
        throw new Error(
            'useSchedulerJobsContext must be used within a SchedulerJobsProvider',
        );
    }
    return context;
}

export default useSchedulerJobsContext;
