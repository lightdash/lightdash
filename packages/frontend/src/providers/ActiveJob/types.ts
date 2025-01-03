import { type Job } from '@lightdash/common';
import { type Dispatch, type SetStateAction } from 'react';

export interface ContextType {
    isJobsDrawerOpen: boolean;
    setIsJobsDrawerOpen: Dispatch<SetStateAction<boolean>>;
    activeJobId: string | undefined;
    setActiveJobId: Dispatch<SetStateAction<any>>;
    activeJob: Job | undefined;
    activeJobIsRunning: boolean | undefined;
}
