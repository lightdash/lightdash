import { Title, type TitleProps } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

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
    const { t } = useTranslation('projectConnection');
    return (
        <OnboardingTitle>
            {isCreatingFirstProject
                ? t('connectFlow.title.firstProject')
                : t('connectFlow.title.newProject')}
        </OnboardingTitle>
    );
};
