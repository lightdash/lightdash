import { Paper, SimpleGrid, type PaperProps } from '@mantine-8/core';
import { type FC } from 'react';
import classes from './SettingsCard.module.css';

const SettingsCard: FC<React.PropsWithChildren<PaperProps>> = ({
    children,
    ...rest
}) => {
    return (
        <Paper shadow="subtle" withBorder p="md" radius="md" {...rest}>
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
}) => {
    return (
        <SettingsCard className={classes.projectCreationCard}>
            {children}
        </SettingsCard>
    );
};

export { ProjectCreationCard, SettingsCard, SettingsGridCard };
