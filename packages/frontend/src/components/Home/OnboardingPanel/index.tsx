import { Intent } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useTracking } from '../../../providers/TrackingProvider';
import Step1 from '../../../svgs/onboarding1.svg';
import Step2 from '../../../svgs/onboarding2.svg';
import Step3 from '../../../svgs/onboarding3.svg';
import { EventName } from '../../../types/Events';
import {
    ButtonWrapper,
    CardWrapper,
    CTA,
    Intro,
    OnboardingPanelWrapper,
    StepContainer,
    StepDescription,
    StepsWrapper,
    StepTitle,
    Title,
} from './OnboardingSteps.styles';

interface Props {
    projectUuid: string;
    userName?: string;
}

const onboardingSteps = [
    {
        title: '1. Run queries',
        description: 'to explore your data',
        image: <img src={Step1} alt="onboarding-step-1" />,
    },
    {
        title: '2. Create charts',
        description: 'using your query results',
        image: <img src={Step2} alt="onboarding-step-2" />,
    },
    {
        title: '3. Build dashboards',
        description: 'to share your insights',
        image: <img src={Step3} alt="onboarding-step-3" />,
    },
];

const OnboardingPanel: FC<Props> = ({ projectUuid, userName }) => {
    const { track } = useTracking();
    return (
        <OnboardingPanelWrapper>
            <Title>
                {`Welcome${userName ? ', ' + userName : ' to Lightdash'}! 👋`}
            </Title>
            <Intro>
                You&apos;re ready to start exploring. Here&apos;s what you can
                do with Lightdash:
            </Intro>
            <CardWrapper>
                <StepsWrapper>
                    {onboardingSteps.map((step, item) => (
                        <StepContainer key={step.title}>
                            {step.image}
                            <StepTitle>{step.title}</StepTitle>
                            <StepDescription>
                                {step.description}
                            </StepDescription>
                        </StepContainer>
                    ))}
                </StepsWrapper>
                <ButtonWrapper>
                    <CTA
                        text="Run your first query!"
                        intent={Intent.PRIMARY}
                        href={`/projects/${projectUuid}/tables`}
                        onClick={() => {
                            track({
                                name: EventName.ONBOARDING_STEP_CLICKED,
                                properties: {
                                    action: 'run_query',
                                },
                            });
                        }}
                    />
                </ButtonWrapper>
            </CardWrapper>
        </OnboardingPanelWrapper>
    );
};

export default OnboardingPanel;
