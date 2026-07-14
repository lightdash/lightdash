import { Card, Stack, Text, Title } from '@mantine-8/core';
import { type FC, type ReactNode } from 'react';

type StepPanelProps = {
    title: string;
    description?: ReactNode;
    children: ReactNode;
};

const StepPanel: FC<StepPanelProps> = ({ title, description, children }) => (
    <Card withBorder padding="xl">
        <Stack gap="lg">
            <Stack gap="xs">
                <Title order={3} tabIndex={-1} data-onboarding-heading>
                    {title}
                </Title>
                {description && (
                    <Text c="dimmed" size="sm">
                        {description}
                    </Text>
                )}
            </Stack>
            {children}
        </Stack>
    </Card>
);

export default StepPanel;
