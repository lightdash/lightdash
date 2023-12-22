import { Paper, PaperProps, SimpleGrid } from '@mantine/core';
import { FC } from 'react';

const SettingsCard: FC<React.PropsWithChildren<PaperProps>> = ({
    children,
    ...rest
}) => {
    return (
        <Paper shadow="sm" withBorder p="md" {...rest}>
            {children}
        </Paper>
    );
};

const SettingsGridCard: FC<React.PropsWithChildren<PaperProps>> = ({
    children,
    ...rest
}) => {
    return (
        <SettingsCard {...rest}>
            <SimpleGrid cols={2}>{children}</SimpleGrid>
        </SettingsCard>
    );
};

const ProjectCreationCard: FC<React.PropsWithChildren<PaperProps>> = ({
    children,
    ...rest
}) => {
    return (
        <SettingsCard
            p="lg"
            mb="lg"
            display="flex"
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
