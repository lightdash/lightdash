import { Classes, Drawer, Icon, Position } from '@blueprintjs/core';
import { JobStep, JobStepStatusType } from 'common';
import moment from 'moment';
import React, { FC } from 'react';
import {
    jobStatusLabel,
    jobStepStatusLabel,
    runningStepsInfo,
} from '../../../hooks/useRefreshServer';
import { useApp } from '../../../providers/AppProvider';
import {
    ErrorMessageWrapper,
    RefreshStepsHeadingWrapper,
    RefreshStepsTitle,
    Step,
    StepIcon,
    StepInfo,
    StepName,
    StepsCompletionOverview,
    StepStatus,
    StepStatusWrapper,
    StepsWrapper,
} from './JobDetailsDrawer.styles';

const durationSince = (
    startTime: Date,
    endTime: Date | undefined = undefined,
) => {
    return moment
        .utc(
            moment
                .duration(moment(endTime).diff(moment(startTime)))
                .asMilliseconds(),
        )
        .format('HH:mm:ss');
};

const jobStepDuration = (jobStep: JobStep): string | null => {
    switch (jobStep.stepStatus) {
        case JobStepStatusType.ERROR:
        case JobStepStatusType.DONE:
            return durationSince(
                jobStep.startedAt || jobStep.updatedAt,
                jobStep.updatedAt,
            );
        case JobStepStatusType.RUNNING:
            return durationSince(jobStep.startedAt || jobStep.updatedAt);
        default:
            return null;
    }
};

const JobDetailsDrawer: FC = () => {
    const { isJobsDrawerOpen, setIsJobsDrawerOpen, activeJob } = useApp();

    if (!activeJob) {
        return null;
    }

    const hasSteps = !!activeJob?.steps.length;
    return (
        <Drawer
            autoFocus
            canEscapeKeyClose
            canOutsideClickClose
            enforceFocus
            hasBackdrop
            isCloseButtonShown
            isOpen={isJobsDrawerOpen}
            onClose={() => setIsJobsDrawerOpen(false)}
            shouldReturnFocusOnClose
            size={'400px'}
            title={
                <RefreshStepsHeadingWrapper className={Classes.DIALOG_HEADER}>
                    <Icon
                        icon={jobStatusLabel(activeJob?.jobStatus).icon}
                        size={18}
                    />
                    <div>
                        <RefreshStepsTitle>
                            {jobStatusLabel(activeJob?.jobStatus).label}
                        </RefreshStepsTitle>
                        {hasSteps && (
                            <StepsCompletionOverview>{`${
                                runningStepsInfo(activeJob?.steps)
                                    .numberOfCompletedSteps
                            }/${
                                runningStepsInfo(activeJob?.steps).totalSteps
                            } steps complete - ${durationSince(
                                activeJob?.createdAt,
                            )}`}</StepsCompletionOverview>
                        )}
                    </div>
                </RefreshStepsHeadingWrapper>
            }
            position={Position.RIGHT}
        >
            <StepsWrapper>
                {activeJob?.steps?.map((step) => (
                    <Step status={step.stepStatus}>
                        <StepIcon
                            icon={
                                step.stepStatus !== 'PENDING'
                                    ? jobStepStatusLabel(step.stepStatus).icon
                                    : null
                            }
                            status={step.stepStatus}
                        />
                        <StepInfo>
                            <StepName>{step.stepLabel}</StepName>
                            <StepStatusWrapper>
                                <StepStatus status={step.stepStatus}>
                                    {jobStepStatusLabel(step.stepStatus).label}{' '}
                                </StepStatus>
                                {jobStepDuration(step)}
                            </StepStatusWrapper>
                            {step.stepError && (
                                <ErrorMessageWrapper>
                                    <p>{step.stepError}</p>
                                </ErrorMessageWrapper>
                            )}
                        </StepInfo>
                    </Step>
                ))}
            </StepsWrapper>
        </Drawer>
    );
};

export default JobDetailsDrawer;
