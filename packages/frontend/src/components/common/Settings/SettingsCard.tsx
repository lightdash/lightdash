import { Paper, type PaperProps } from '@mantine-8/core';
import { type FC, type PropsWithChildren } from 'react';
import classes from './SettingsCard.module.css';

const SettingsCard: FC<PropsWithChildren<PaperProps>> = ({
    children,
    ...rest
}) => {
    return (
        <Paper shadow="subtle" withBorder p="lg" radius="md" {...rest}>
            {children}
        </Paper>
    );
};

const SettingsGridCard: FC<PropsWithChildren<PaperProps>> = ({
    children,
    ...rest
}) => {
    return (
        <SettingsCard {...rest}>
            <div className={classes.settingsGrid}>{children}</div>
        </SettingsCard>
    );
};

const ProjectCreationCard: FC<PropsWithChildren<PaperProps>> = ({
    children,
}) => {
    return (
        <SettingsCard className={classes.projectCreationCard}>
            {children}
        </SettingsCard>
    );
};

export { ProjectCreationCard, SettingsCard, SettingsGridCard };
