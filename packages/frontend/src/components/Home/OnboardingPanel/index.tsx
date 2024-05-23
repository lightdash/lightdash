import { Card, Group, Paper, Stack, Text, Title } from '@mantine/core';
import React, { type FC } from 'react';
import Step1 from '../../../svgs/onboarding1.svg';
import Step2 from '../../../svgs/onboarding2.svg';
import Step3 from '../../../svgs/onboarding3.svg';
import { useApp } from '../../../providers/AppProvider';
import { EventName } from '../../../types/Events';
import MantineLinkButton from '../../common/MantineLinkButton';
import { Helmet } from 'react-helmet';

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
    const { health } = useApp();
    return (
        <>
        <Helmet>
            <title>{`${health.data?.siteName}`}</title>
        </Helmet>
        <Stack justify="flex-start" spacing="xs" mt="4xl">
            <Title order={3}>
                {`Welcome${userName ? ', ' + userName : ' to ' + health.data?.siteName }! 👋`}
            </Title>
            <Text color="gray.7">
                You&apos;re ready to start exploring. Here&apos;s what you can
                do with {`${health.data?.siteName}`}:
            </Text>
            <Paper withBorder p="xl" mt="lg">
                <Group position="center">
                    {onboardingSteps.map((step) => (
                        <Card key={step.title} mx="xl">
                            <Card.Section mx="lg" p="md">
                                {step.image}
                            </Card.Section>
                            <Title order={5} fw={500} ta="center">
                                {step.title}
                            </Title>
                            <Text size="sm" color="gray.6" ta="center">
                                {step.description}
                            </Text>
                        </Card>
                    ))}
                    <MantineLinkButton
                        href={`/projects/${projectUuid}/tables`}
                        trackingEvent={{
                            name: EventName.ONBOARDING_STEP_CLICKED,
                            properties: {
                                action: 'run_query',
                            },
                        }}
                        my="xl"
                    >
                        Run your first query!
                    </MantineLinkButton>
                </Group>
            </Paper>
        </Stack>
        </>
    );
};

export default OnboardingPanel;
