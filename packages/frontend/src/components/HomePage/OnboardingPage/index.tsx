import { Intent } from '@blueprintjs/core';
import { IncompleteOnboarding } from 'common';
import React, { FC } from 'react';
import Logo from '../../../svgs/logo.svg';
import Step1 from '../../../svgs/onboarding1.svg';
import Step2 from '../../../svgs/onboarding2.svg';
import Step3 from '../../../svgs/onboarding3.svg';
import {
    CardWrapper,
    CTA,
    Intro,
    OnboardingPageWrapper,
    StepContainer,
    StepDescription,
    StepsWrapper,
    StepTitle,
    Title,
} from './OnboardingSteps.styles';

interface Props {
    status: IncompleteOnboarding;
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

const OnboardingPage: FC<Props> = ({ status, projectUuid, userName }) => (
    <OnboardingPageWrapper>
        <Title>
            {' '}
            {`Welcome ${userName ? userName : 'to Lightdash'}! `}
            <Logo />
        </Title>
        <Intro>
            You&apos;re ready to go! Here&apos;s what you can do with Lightdash:
        </Intro>
        {/* <OnboardingSteps status={status} projectUuid={projectUuid} /> */}
        <CardWrapper>
            <StepsWrapper>
                {onboardingSteps.map((step, item) => (
                    <StepContainer>
                        {step.image}
                        <StepTitle>{step.title}</StepTitle>
                        <StepDescription>{step.description}</StepDescription>
                    </StepContainer>
                ))}
            </StepsWrapper>
            <CTA
                text="Run your first query!"
                intent={Intent.PRIMARY}
                href="/projects/:projectUuid/tables/:tableId"
            />
        </CardWrapper>
    </OnboardingPageWrapper>
);

export default OnboardingPage;
