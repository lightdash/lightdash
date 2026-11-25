/**
 * The rows a live data source's settings are made of: a label and a short
 * hint on the left, a control on the right, grouped in titled cards. Adding a
 * source and changing its settings use the same ones.
 */
import { ActionIcon, Box, Button, Group, Stack, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { type FC, type FormEvent, type ReactNode } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './LiveSourceSettingsRows.module.css';

/** A label and a short hint on the left, its control on the right. */
export const SettingsRow: FC<{
    label: ReactNode;
    hint?: ReactNode;
    children: ReactNode;
    /** Dims the label and hint, such as for an explore that is switched off. */
    dimmed?: boolean;
}> = ({ label, hint, children, dimmed }) => (
    <Box className={classes.settingsRow}>
        <Box miw={0} opacity={dimmed ? 0.5 : undefined}>
            <span className={classes.settingsLabel}>{label}</span>
            {hint ? <Box className={classes.settingsHint}>{hint}</Box> : null}
        </Box>
        <Group gap="xs" wrap="nowrap" justify="flex-end" flex="none">
            {children}
        </Group>
    </Box>
);

/** Cancel and Save changes under a card's editable rows, once one is edited. */
export const SettingsSaveFooter: FC<{
    isChanged: boolean;
    isSaving: boolean;
    /** False keeps Save changes disabled until the fields can be saved. */
    isValid?: boolean;
    onCancel: () => void;
}> = ({ isChanged, isSaving, isValid = true, onCancel }) =>
    isChanged ? (
        <Group justify="flex-end" gap="xs" className={classes.settingsFooter}>
            <Button
                size="xs"
                variant="default"
                disabled={isSaving}
                onClick={onCancel}
            >
                Cancel
            </Button>
            <Button
                type="submit"
                size="xs"
                disabled={!isValid}
                loading={isSaving}
            >
                Save changes
            </Button>
        </Group>
    ) : null;

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
    /** More about the card, behind an info icon after its title. */
    titleInfo?: string;
    /** Makes the card a form whose rows save together. */
    onSubmit?: (event: FormEvent) => void;
    children: ReactNode;
}> = ({ title, titleInfo, onSubmit, children }) => (
    <Stack gap={6}>
        {title ? (
            <span className={classes.settingsTitle}>
                {title}
                {titleInfo ? (
                    <Tooltip
                        label={titleInfo}
                        multiline
                        maw={320}
                        withinPortal
                        events={{ hover: true, focus: true, touch: true }}
                    >
                        <ActionIcon size="xs" aria-label={titleInfo}>
                            <MantineIcon
                                icon={IconInfoCircle}
                                size={14}
                                color="dimmed"
                            />
                        </ActionIcon>
                    </Tooltip>
                ) : null}
            </span>
        ) : null}
        {onSubmit ? (
            <form className={classes.settings} onSubmit={onSubmit} noValidate>
                {children}
            </form>
        ) : (
            <Box className={classes.settings}>{children}</Box>
        )}
    </Stack>
);
