import { Classes, Drawer, Icon, IconName, Position } from '@blueprintjs/core';
import React, { Dispatch, FC, SetStateAction, useMemo } from 'react';
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
} from './RefreshStepsModal.styles';

const refreshStepsMockup = {
    jobStatus: 'RUNNING', // refresh status ('DONE' | 'RUNNING' | 'ERROR')
    jobResults: '/projects/{projectUuid}/explores',
    createdAt: '2022-04-25T12:16:08.923Z',
    updatedAt: '2022-04-25T12:16:14.528Z',
    steps: [
        {
            name: 'Clone dbt project from github', // step name
            stepStatus: 'DONE', // step status ('DONE' | 'RUNNING' | 'ERROR' | 'PENDING' | 'SKIPPED')
            createdAt: '2022-04-25T12:16:08.923Z',
            updatedAt: '2022-04-25T12:16:14.528Z', // time it has run for in mins/secs
        },
        {
            name: 'Install dbt project dependencies ', // step name
            stepStatus: 'RUNNING', // step status ('DONE' | 'RUNNING' | 'ERROR' | 'PENDING' | 'SKIPPED')
            createdAt: '2022-04-25T12:16:08.923Z',
            updatedAt: '2022-04-25T12:16:14.528Z', // time it has run for in mins/secs
        },
        {
            name: 'Compile dbt project', // step name
            stepStatus: 'ERROR', // step status ('DONE' | 'RUNNING' | 'ERROR' | 'PENDING' | 'SKIPPED')
            error: {
                name: 'Name n_stores not found inside',
                message: 'campaign_all_brand-hist at [2:33]',
            },
            createdAt: '2022-04-25T12:16:08.923Z',
            updatedAt: '2022-04-25T12:16:14.528Z', // time it has run for in mins/secs
        },
        {
            name: 'Get latest data warehouse schema', // step name
            stepStatus: 'PENDING', // step status ('DONE' | 'RUNNING' | 'ERROR' | 'PENDING' | 'SKIPPED')
            createdAt: '2022-04-25T12:16:08.923Z',
            updatedAt: '2022-04-25T12:16:08.923Z', // time it has run for in mins/secs
        },
        {
            name: 'Compile metrics and dimensions', // step name
            stepStatus: 'PENDING', // step status ('DONE' | 'RUNNING' | 'ERROR' | 'PENDING' | 'SKIPPED')
            createdAt: '2022-04-25T12:16:08.923Z',
            updatedAt: '2022-04-25T12:16:08.923Z', // time it has run for in mins/secs
        },
    ],
};

interface Props {
    onClose: Dispatch<SetStateAction<boolean>>;
    isOpen: boolean;
    jobId: string;
}

const RefreshStepsModal: FC<Props> = ({ onClose, isOpen, jobId }) => {
    // const { data } = useGetRefreshData(jobId);

    const statusInfo: (status: string) => {
        title: string;
        icon: IconName;
        status: string;
    } = useMemo(
        () => (status: string) => {
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
        },
        [],
    );

    const totalSteps = refreshStepsMockup.steps.length;
    const numberOfCompletedSteps = refreshStepsMockup.steps.filter((step) => {
        return step.stepStatus === 'DONE';
    }).length;

    return (
        <Drawer
            autoFocus
            canEscapeKeyClose
            canOutsideClickClose
            enforceFocus
            hasBackdrop
            isCloseButtonShown
            isOpen={isOpen}
            onClose={() => onClose(false)}
            shouldReturnFocusOnClose
            size={'400px'}
            title={
                <RefreshStepsHeadingWrapper className={Classes.DIALOG_HEADER}>
                    <Icon
                        icon={statusInfo(refreshStepsMockup.jobStatus).icon}
                        size={18}
                    />
                    <div>
                        <RefreshStepsTitle>
                            {statusInfo(refreshStepsMockup.jobStatus).title}
                        </RefreshStepsTitle>
                        <StepsCompletionOverview>{`${numberOfCompletedSteps}/${totalSteps} steps complete - `}</StepsCompletionOverview>
                    </div>
                </RefreshStepsHeadingWrapper>
            }
            position={Position.RIGHT}
        >
            <StepsWrapper>
                {refreshStepsMockup.steps.map((step) => (
                    <Step status={step.stepStatus}>
                        <StepIcon
                            icon={
                                step.stepStatus !== 'PENDING'
                                    ? statusInfo(step.stepStatus).icon
                                    : null
                            }
                            status={step.stepStatus}
                        />
                        <StepInfo>
                            <StepName>{step.name}</StepName>
                            <StepStatusWrapper>
                                <StepStatus status={step.stepStatus}>
                                    {statusInfo(step.stepStatus).status}{' '}
                                </StepStatus>

                                {step.stepStatus !== 'ERROR'
                                    ? step.stepStatus !== 'PENDING'
                                        ? step.createdAt
                                        : null
                                    : null}
                            </StepStatusWrapper>
                            {step.error && (
                                <ErrorMessageWrapper>
                                    <p>
                                        {step.error.name}
                                        <br /> {step.error.message}
                                    </p>
                                </ErrorMessageWrapper>
                            )}
                        </StepInfo>
                    </Step>
                ))}
            </StepsWrapper>
        </Drawer>
    );
};

export default RefreshStepsModal;
