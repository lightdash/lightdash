import { Classes, Drawer, Icon, Position } from '@blueprintjs/core';
import React, { FC } from 'react';
import {
    refreshStatusInfo,
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
} from './RefreshStepsModal.styles';

const RefreshStepsModal: FC = () => {
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
                        icon={refreshStatusInfo(activeJob?.jobStatus).icon}
                        size={18}
                    />
                    <div>
                        <RefreshStepsTitle>
                            {refreshStatusInfo(activeJob?.jobStatus).title}
                        </RefreshStepsTitle>
                        {hasSteps && (
                            <StepsCompletionOverview>{`${
                                runningStepsInfo(activeJob?.steps)
                                    .numberOfCompletedSteps
                            } steps complete `}</StepsCompletionOverview>
                        )}
                    </div>
                </RefreshStepsHeadingWrapper>
            }
            position={Position.RIGHT}
        >
            <StepsWrapper>
                {activeJob?.steps?.map((step: any) => (
                    <Step status={step.stepStatus}>
                        <StepIcon
                            icon={
                                step.stepStatus !== 'PENDING'
                                    ? refreshStatusInfo(step.stepStatus).icon
                                    : null
                            }
                            status={step.stepStatus}
                        />
                        <StepInfo>
                            <StepName>{step.name}</StepName>
                            <StepStatusWrapper>
                                <StepStatus status={step.stepStatus}>
                                    {refreshStatusInfo(step.stepStatus).status}{' '}
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
