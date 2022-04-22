import React, { FC } from 'react';
import {
    InfoWrapper,
    RefreshStepsHeadingWrapper,
    RefreshStepsModalWrapper,
    RefreshStepsTitle,
    Step,
    StepName,
    StepsCompletionOverview,
    StepsWrapper,
} from './RefreshStepsModal.style';

interface Props {
    title: string;
}

const refreshStepsMockup = {
    status: 'success', // refresh status ('success' | 'inProgress' | 'pending' | 'error')
    steps: [
        {
            name: 'Clone dbt project from github', // step name
            status: 'inProgress', // step status ('success' | 'inProgress' | 'pending' | 'error')
            runningTime: 2, // time it has run for in mins/secs
        },
        {
            name: 'Install dbt project dependencies ', // step name
            status: 'inProgress', // step status ('success' | 'inProgress' | 'pending' | 'error')
            runningTime: 2, // time it has run for in mins/secs
        },
        {
            name: 'Compile dbt project', // step name
            status: 'inProgress', // step status ('success' | 'inProgress' | 'pending' | 'error')
            runningTime: 2, // time it has run for in mins/secs
        },
        {
            name: 'Get latest data warehouse schema', // step name
            status: 'inProgress', // step status ('success' | 'inProgress' | 'pending' | 'error')
            runningTime: 2, // time it has run for in mins/secs
        },
        {
            name: 'Compile metrics and dimensions', // step name
            status: 'inProgress', // step status ('success' | 'inProgress' | 'pending' | 'error')
            runningTime: 2, // time it has run for in mins/secs
        },
    ],
};

const RefreshStepsModal: FC = () => {
    const statusTitle = () => {
        switch (refreshStepsMockup.status) {
            case 'success':
                return 'Sync successful!';
            case 'error':
                return 'Error in sync';
            case 'inProgress':
                return 'Sync in progress';

            default:
                break;
        }
    };

    const totalSteps = refreshStepsMockup.steps.length;
    const numberOfCompletedSteps = refreshStepsMockup.steps.filter((step) => {
        return step.status === 'completed';
    });

    return (
        <RefreshStepsModalWrapper>
            <RefreshStepsHeadingWrapper>
                <RefreshStepsTitle>{statusTitle}</RefreshStepsTitle>
                <StepsCompletionOverview>{`${numberOfCompletedSteps.length}/${totalSteps} steps complete - `}</StepsCompletionOverview>
            </RefreshStepsHeadingWrapper>
            <StepsWrapper>
                {refreshStepsMockup.steps.map((step) => (
                    <Step>
                        <StepName>{step.name}</StepName>
                        <InfoWrapper>
                            <p>
                                {step.status}
                                <span>{step.runningTime}</span>
                            </p>
                        </InfoWrapper>
                    </Step>
                ))}
            </StepsWrapper>
        </RefreshStepsModalWrapper>
    );
};

export default RefreshStepsModal;
