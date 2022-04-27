import { IconName } from '@blueprintjs/core';

export const refreshStatusInfo = (
    status: string,
): { title: string; icon: IconName; status: string } => {
    switch (status) {
        case 'DONE':
            return {
                title: 'Sync successful!',
                icon: 'tick-circle',
                status: 'Success',
            };
        case 'ERROR':
            return {
                title: 'Error in sync',
                icon: 'warning-sign',
                status: 'Error',
            };
        case 'RUNNING':
            return {
                title: 'Sync in progress',
                icon: 'refresh',
                status: 'In progress',
            };

        case 'PENDING':
            return {
                title: 'Sync in progress',
                icon: 'refresh',
                status: 'Queued',
            };

        default:
            return {
                title: 'Sync in progress',
                icon: 'refresh',
                status: 'Success',
            };
    }
};

export const runningStepsInfo = (steps: any[]) => {
    const runningStep = steps.find((step: any) => {
        return step.jobStatus === 'RUNNING';
    });
    const numberOfCompletedSteps = steps.filter((step: any) => {
        return step.stepStatus === 'DONE';
    }).length;
    const completedStepsMessage = `${numberOfCompletedSteps}/${steps.length}`;

    return { runningStep, numberOfCompletedSteps, completedStepsMessage };
};
