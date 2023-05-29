import { Card, CardProps, SimpleGrid } from '@mantine/core';
import { FC } from 'react';

const SettingsCard: FC<CardProps> = ({ children, ...rest }) => {
    return (
        <Card shadow="sm" withBorder {...rest}>
            {children}
        </Card>
    );
};

const SettingsGridCard: FC<CardProps> = ({ children, ...rest }) => {
    return (
        <SettingsCard {...rest}>
            <SimpleGrid cols={2}>{children}</SimpleGrid>
        </SettingsCard>
    );
};

const ProjectCreationCard: FC<CardProps> = ({ children, ...rest }) => {
    return (
        <SettingsCard
            p="lg"
            display="flex"
            mb="lg"
            {...rest}
            sx={{
                flexDirection: 'column',
                textAlign: 'center',
                ...rest.sx,
            }}
        >
            {children}
        </SettingsCard>
    );
};

export { SettingsCard, SettingsGridCard, ProjectCreationCard };
