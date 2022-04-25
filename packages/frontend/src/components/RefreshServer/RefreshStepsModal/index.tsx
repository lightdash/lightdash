import { Classes, Drawer, IconName, Position } from '@blueprintjs/core';
import React, { FC } from 'react';
import {
    ErrorMessageWrapper,
    RefreshStepsHeadingWrapper,
    RefreshStepsTitle,
    Step,
    StepIcon,
    StepName,
    StepsCompletionOverview,
    StepStatus,
    StepStatusWrapper,
    StepsWrapper,
} from './RefreshStepsModal.style';

const refreshStepsMockup = {
    jobStatus: 'DONE', // refresh status ('DONE' | 'RUNNING' | 'ERROR')
    jobResults: '/projects/{projectUuid}/explores',
    steps: [
        {
            name: 'Clone dbt project from github', // step name
            stepStatus: 'DONE', // step status ('DONE' | 'RUNNING' | 'ERROR' | 'PENDING' | 'SKIPPED')
            runningTime: '00:00:31', // time it has run for in mins/secs
        },
        {
            name: 'Install dbt project dependencies ', // step name
            stepStatus: 'RUNNING', // step status ('DONE' | 'RUNNING' | 'ERROR' | 'PENDING' | 'SKIPPED')
            runningTime: '00:00:31', // time it has run for in mins/secs
        },
        {
            name: 'Compile dbt project', // step name
            stepStatus: 'ERROR', // step status ('DONE' | 'RUNNING' | 'ERROR' | 'PENDING' | 'SKIPPED')
            error: {
                name: 'Name n_stores not found inside',
                message: 'campaign_all_brand-hist at [2:33]',
            },
            runningTime: '00:00:31', // time it has run for in mins/secs
        },
        {
            name: 'Get latest data warehouse schema', // step name
            stepStatus: 'PENDING', // step status ('DONE' | 'RUNNING' | 'ERROR' | 'PENDING' | 'SKIPPED')
            runningTime: '00:00:31', // time it has run for in mins/secs
        },
        {
            name: 'Compile metrics and dimensions', // step name
            stepStatus: 'PENDING', // step status ('DONE' | 'RUNNING' | 'ERROR' | 'PENDING' | 'SKIPPED')
            runningTime: '00:00:31', // time it has run for in mins/secs
        },
    ],
};

const RefreshStepsModal: FC = () => {
    const statusInfo = (
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

    const totalSteps = refreshStepsMockup.steps.length;
    const numberOfCompletedSteps = refreshStepsMockup.steps.filter((step) => {
        return step.stepStatus === 'DONE';
    });

    return (
        <Drawer
            autoFocus
            canEscapeKeyClose
            canOutsideClickClose
            enforceFocus
            hasBackdrop
            icon={statusInfo(refreshStepsMockup.jobStatus).icon}
            isCloseButtonShown
            isOpen={true}
            // onClose={() => errorLogs.setErrorLogsVisible(false)}
            // onClosed={errorLogs.setAllLogsRead}
            shouldReturnFocusOnClose
            size={'400px'}
            title={
                <RefreshStepsHeadingWrapper className={Classes.DIALOG_HEADER}>
                    <RefreshStepsTitle>
                        {statusInfo(refreshStepsMockup.jobStatus).title}
                    </RefreshStepsTitle>
                    <StepsCompletionOverview>{`${numberOfCompletedSteps.length}/${totalSteps} steps complete - 00:01:30`}</StepsCompletionOverview>
                </RefreshStepsHeadingWrapper>
            }
            position={Position.RIGHT}
        >
            <StepsWrapper>
                {refreshStepsMockup.steps.map((step) => (
                    <Step status={step.stepStatus}>
                        <div>
                            {step.stepStatus !== 'PENDING' && (
                                <StepIcon
                                    icon={statusInfo(step.stepStatus).icon}
                                    status={step.stepStatus}
                                />
                            )}
                        </div>
                        <div>
                            <StepName>{step.name}</StepName>
                            <StepStatusWrapper>
                                <StepStatus status={step.stepStatus}>
                                    {statusInfo(step.stepStatus).status}{' '}
                                </StepStatus>
                                {!step.error && step.runningTime}
                            </StepStatusWrapper>
                            {step.error && (
                                <ErrorMessageWrapper>
                                    <p>
                                        {step.error.name}
                                        <br /> {step.error.message}
                                    </p>
                                </ErrorMessageWrapper>
                            )}
                        </div>
                    </Step>
                ))}
            </StepsWrapper>
        </Drawer>
    );
};

export default RefreshStepsModal;
