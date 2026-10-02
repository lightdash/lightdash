import {
    isCreateProjectJob,
    JobStatusType,
    JobStepStatusType,
    type Job,
    type WarehouseTypes,
} from '@lightdash/common';
import { useEffect, useRef } from 'react';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';

type Args = {
    activeJob: Job | undefined;
    createProjectJobId: string | undefined;
    warehouse: WarehouseTypes;
    warehouseOnly: boolean;
    onboardingFlow: 'new' | 'legacy';
};

// The warehouse adapter test runs inside the async create job, so connection
// failures surface as the job's ERROR status, not via the mutation's onError.
export const useTrackCreateProjectFailure = ({
    activeJob,
    createProjectJobId,
    warehouse,
    warehouseOnly,
    onboardingFlow,
}: Args) => {
    const { track } = useTracking();
    const trackedFailedJobRef = useRef<string | undefined>(undefined);
    useEffect(() => {
        if (
            createProjectJobId &&
            createProjectJobId === activeJob?.jobUuid &&
            isCreateProjectJob(activeJob) &&
            activeJob.jobStatus === JobStatusType.ERROR &&
            trackedFailedJobRef.current !== createProjectJobId
        ) {
            trackedFailedJobRef.current = createProjectJobId;
            const failedStep = activeJob.steps.find(
                (step) => step.stepStatus === JobStepStatusType.ERROR,
            );
            track({
                name: EventName.CREATE_PROJECT_FAILED,
                properties: {
                    warehouse,
                    errorType: failedStep?.stepType ?? 'unknown',
                    warehouseOnly,
                    onboardingFlow,
                },
            });
        }
    }, [
        activeJob,
        createProjectJobId,
        warehouse,
        warehouseOnly,
        onboardingFlow,
        track,
    ]);
};
