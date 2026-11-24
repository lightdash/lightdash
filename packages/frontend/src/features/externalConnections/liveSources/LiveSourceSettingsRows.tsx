/**
 * The rows a live data source's settings are made of: a label and a short
 * hint on the left, a control on the right, grouped in titled cards. Adding a
 * source and changing its settings use the same ones.
 */
import { Box, Group, Stack } from '@mantine/core';
import { type FC, type FormEvent, type ReactNode } from 'react';
import classes from './LiveSourceSettingsRows.module.css';

/** A label and a short hint on the left, its control on the right. */
export const SettingsRow: FC<{
    label: string;
    hint?: ReactNode;
    children: ReactNode;
}> = ({ label, hint, children }) => (
    <Box className={classes.settingsRow}>
        <Box miw={0}>
            <span className={classes.settingsLabel}>{label}</span>
            {hint ? <Box className={classes.settingsHint}>{hint}</Box> : null}
        </Box>
        <Group gap="xs" wrap="nowrap" justify="flex-end" flex="none">
            {children}
        </Group>
    </Box>
);

/** Content that brings its own surface (a table), titled like a card. */
export const SettingsSection: FC<{
    title: string;
    children: ReactNode;
}> = ({ title, children }) => (
    <Stack gap={6}>
        <span className={classes.settingsTitle}>{title}</span>
        {children}
    </Stack>
);

/** A raised card, one row per setting, under an optional title. */
export const SettingsCard: FC<{
    title?: string;
    /** Makes the card a form whose rows save together. */
    onSubmit?: (event: FormEvent) => void;
    children: ReactNode;
}> = ({ title, onSubmit, children }) => (
    <Stack gap={6}>
        {title ? <span className={classes.settingsTitle}>{title}</span> : null}
        {onSubmit ? (
            <form className={classes.settings} onSubmit={onSubmit} noValidate>
                {children}
            </form>
        ) : (
            <Box className={classes.settings}>{children}</Box>
        )}
    </Stack>
);
