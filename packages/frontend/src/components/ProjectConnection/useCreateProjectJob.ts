import { isCreateProjectJob, JobStatusType } from '@lightdash/common';
import { useCallback, useEffect, useState } from 'react';
import { useActiveCreateProjectJob } from '../../hooks/useActiveCreateProjectJob';
import useActiveJob from '../../providers/ActiveJob/useActiveJob';

export const useCreateProjectJob = (warehouseOnly: boolean) => {
    const [createProjectJobId, setCreateProjectJobId] = useState<string>();
    const { activeJob, setActiveJobId, setQuietActiveJobId } = useActiveJob();

    const resumeJob = useCallback(
        (jobUuid: string) => {
            setCreateProjectJobId(jobUuid);
            if (warehouseOnly) {
                setQuietActiveJobId(jobUuid);
            } else {
                setActiveJobId(jobUuid);
            }
        },
        [warehouseOnly, setActiveJobId, setQuietActiveJobId],
    );

    const { data: inFlightJob, isInitialLoading: isCheckingInFlightJob } =
        useActiveCreateProjectJob();

    useEffect(() => {
        if (
            !inFlightJob ||
            createProjectJobId ||
            ![JobStatusType.STARTED, JobStatusType.RUNNING].includes(
                inFlightJob.jobStatus,
            )
        ) {
            return;
        }
        resumeJob(inFlightJob.jobUuid);
    }, [inFlightJob, createProjectJobId, resumeJob]);

    const thisJob =
        createProjectJobId &&
        createProjectJobId === activeJob?.jobUuid &&
        isCreateProjectJob(activeJob)
            ? activeJob
            : undefined;

    return {
        activeJob,
        createProjectJobId,
        setCreateProjectJobId,
        resumeJob,
        isCheckingInFlightJob,
        thisJob,
        hasThisJobFailed: thisJob?.jobStatus === JobStatusType.ERROR,
    };
};
