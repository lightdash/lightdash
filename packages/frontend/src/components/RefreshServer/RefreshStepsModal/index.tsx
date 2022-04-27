import { Classes, Drawer, Icon, Position } from '@blueprintjs/core';
import React, { Dispatch, FC, SetStateAction } from 'react';
import {
    refreshStatusInfo,
    runningStepsInfo,
} from '../../../hooks/useRefreshServer';
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

interface Props {
    onClose: Dispatch<SetStateAction<boolean>>;
    isOpen: boolean;
    statusData: any;
}
const RefreshStepsModal: FC<Props> = ({ onClose, isOpen, statusData }) => {
    const hasSteps = !!statusData?.steps.length;

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
                        icon={refreshStatusInfo(statusData?.jobStatus).icon}
                        size={18}
                    />
                    <div>
                        <RefreshStepsTitle>
                            {refreshStatusInfo(statusData?.jobStatus).title}
                        </RefreshStepsTitle>
                        {hasSteps && (
                            <StepsCompletionOverview>{`${
                                runningStepsInfo(statusData?.steps)
                                    .numberOfCompletedSteps
                            } steps complete `}</StepsCompletionOverview>
                        )}
                    </div>
                </RefreshStepsHeadingWrapper>
            }
            position={Position.RIGHT}
        >
            <StepsWrapper>
                {statusData?.steps?.map((step: any) => (
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
