import { Card, Group, Paper, Stack, Text, Title } from '@mantine/core';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import Step1 from '../../../svgs/onboarding1.svg';
import Step2 from '../../../svgs/onboarding2.svg';
import Step3 from '../../../svgs/onboarding3.svg';
import { EventName } from '../../../types/Events';
import MantineLinkButton from '../../common/MantineLinkButton';

interface Props {
    projectUrlIdentifier: string;
    userName?: string;
}

const onboardingSteps = [
    {
        key: 'runQueries',
        image: <img src={Step1} alt="onboarding-step-1" />,
    },
    {
        key: 'createCharts',
        image: <img src={Step2} alt="onboarding-step-2" />,
    },
    {
        key: 'buildDashboards',
        image: <img src={Step3} alt="onboarding-step-3" />,
    },
];

const OnboardingPanel: FC<Props> = ({ projectUrlIdentifier, userName }) => {
    const { t } = useTranslation('home');
    return (
        <Stack justify="flex-start" gap="xs" mt="4xl">
            <Title order={3}>
                {userName
                    ? t('landing.welcomeUser', { name: userName })
                    : t('landing.welcome')}{' '}
                👋
            </Title>
            <Text c="ldGray.7">{t('onboarding.subtitle')}</Text>
            <Paper p="xl" mt="lg">
                <Group justify="center">
                    {onboardingSteps.map((step) => (
                        <Card key={step.key} mx="xl">
                            <Card.Section mx="lg" p="md">
                                {step.image}
                            </Card.Section>
                            <Title order={5} fw={500} ta="center">
                                {t(`onboarding.steps.${step.key}.title`)}
                            </Title>
                            <Text fz="sm" c="dimmed" ta="center">
                                {t(`onboarding.steps.${step.key}.description`)}
                            </Text>
                        </Card>
                    ))}
                    <MantineLinkButton
                        href={`/projects/${projectUrlIdentifier}/tables`}
                        trackingEvent={{
                            name: EventName.ONBOARDING_STEP_CLICKED,
                            properties: {
                                action: 'run_query',
                            },
                        }}
                        my="xl"
                    >
                        {t('onboarding.runFirstQuery')}
                    </MantineLinkButton>
                </Group>
            </Paper>
        </Stack>
    );
};

export default OnboardingPanel;
