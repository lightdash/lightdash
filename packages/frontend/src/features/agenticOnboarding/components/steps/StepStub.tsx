import { Card, Stack, Text, Title } from '@mantine-8/core';
import { type FC } from 'react';

type StepStubProps = {
    title: string;
};

const StepStub: FC<StepStubProps> = ({ title }) => (
    <Card withBorder padding="xl">
        <Stack gap="xs">
            <Title order={3} tabIndex={-1} data-onboarding-heading>
                {title}
            </Title>
            <Text c="dimmed">This step is coming in phase 5b.</Text>
        </Stack>
    </Card>
);

export default StepStub;
