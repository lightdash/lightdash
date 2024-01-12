import { Title, TitleProps } from '@mantine/core';
import { FC } from 'react';

export const OnboardingTitle: FC<React.PropsWithChildren<TitleProps>> = ({
    children,
}) => {
    return (
        <Title order={3} fw={500}>
            {children}
        </Title>
    );
};

interface OnboardingConnectTitleProps {
    isCreatingFirstProject: boolean;
}

export const OnboardingConnectTitle: FC<OnboardingConnectTitleProps> = ({
    isCreatingFirstProject,
}) => {
    return (
        <OnboardingTitle>
            {isCreatingFirstProject
                ? "Let's get you set up!"
                : 'Connect new project'}
        </OnboardingTitle>
    );
};
