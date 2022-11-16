import { Classes, Drawer, Icon, Position, Spinner } from '@blueprintjs/core';
import {
    Job,
    JobStatusType,
    JobStep,
    JobStepStatusType,
} from '@lightdash/common';
import moment from 'moment';
import React, { FC } from 'react';
import {
    jobStatusLabel,
    jobStepStatusLabel,
    runningStepsInfo,
} from '../../hooks/useRefreshServer';
import { useActiveJob } from '../../providers/ActiveJobProvider';
import {
    ErrorMessageWrapper,
    RefreshStepsHeadingWrapper,
    RefreshStepsTitle,
    Step,
    StepIconWrapper,
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

type DrawerIconProps = { job: Job };
const DrawerIcon: FC<DrawerIconProps> = ({ job }: DrawerIconProps) => {
    const iconSize = 18;
    switch (job.jobStatus) {
        case JobStatusType.ERROR:
            return <Icon icon="warning-sign" iconSize={iconSize} />;
        case JobStatusType.DONE:
            return <Icon icon="tick-circle" iconSize={iconSize} />;
        case JobStatusType.RUNNING:
            return <Spinner size={iconSize} />;
        case JobStatusType.STARTED:
            return null;
        default:
            throw new Error('Unknown job status');
    }
};

type StepIconProps = { step: JobStep };
const StepIcon: FC<StepIconProps> = ({ step }: StepIconProps) => {
    switch (step.stepStatus) {
        case JobStepStatusType.ERROR:
            return (
                <StepIconWrapper icon="warning-sign" status={step.stepStatus} />
            );
        case JobStepStatusType.DONE:
            return (
                <StepIconWrapper icon="tick-circle" status={step.stepStatus} />
            );
        case JobStepStatusType.RUNNING:
            return <Spinner size={15} />;
        case JobStepStatusType.SKIPPED:
        case JobStepStatusType.PENDING:
            return null;
        default:
            throw new Error('Unknown job step status');
    }
};

const JobDetailsDrawer: FC = () => {
    const { isJobsDrawerOpen, setIsJobsDrawerOpen, activeJob } = useActiveJob();

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
            size={'600px'}
            title={
                <RefreshStepsHeadingWrapper className={Classes.DIALOG_HEADER}>
                    <DrawerIcon job={activeJob} />
                    <div>
                        <RefreshStepsTitle>
                            {jobStatusLabel(activeJob.jobStatus).label}
                        </RefreshStepsTitle>
                        {hasSteps && (
                            <StepsCompletionOverview>{`${
                                runningStepsInfo(activeJob.steps)
                                    .completedStepsMessage
                            } steps complete - ${durationSince(
                                activeJob.createdAt,
                            )}`}</StepsCompletionOverview>
                        )}
                    </div>
                </RefreshStepsHeadingWrapper>
            }
            position={Position.RIGHT}
        >
            <StepsWrapper>
                {activeJob.steps?.map((step) => (
                    <Step key={step.jobUuid} status={step.stepStatus}>
                        <StepIcon step={step} />
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
                                    {step.stepDbtLogs
                                        ?.filter((log) => log.level === 'error')
                                        .map((log) => (
                                            <p key={log.ts}>
                                                {log.msg
                                                    .split('\n')
                                                    .map((line) => (
                                                        <>
                                                            {line}
                                                            <br />
                                                        </>
                                                    ))}
                                            </p>
                                        ))}
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
