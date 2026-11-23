/**
 * The rows a live data source's settings are made of: a label and a short
 * hint on the left, a control on the right, grouped in titled cards. Adding a
 * source and changing its settings use the same ones.
 */
import { type ExternalConnectionTestResponse } from '@lightdash/common';
import { Box, Group, Stack, Text, Tooltip } from '@mantine/core';
import {
    IconAlertCircleFilled,
    IconCircleCheckFilled,
} from '@tabler/icons-react';
import { type FC, type FormEvent, type ReactNode } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
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

/** The first sentence of a message, which says what went wrong. */
const getFirstSentence = (message: string) => message.split(/(?<=\.)\s/)[0];

/**
 * A test's outcome in one quiet line, in place of the row's hint. A failure
 * shows what the integration said went wrong rather than the generic summary,
 * with its full message, which names what to change, on hover.
 */
export const TestOutcome: FC<{ response: ExternalConnectionTestResponse }> = ({
    response,
}) => {
    const check = response.liveCheck;
    const ok = check?.ok ?? response.status < 300;
    const detail = ok ? null : (check?.detail ?? null);
    const message = ok
        ? (check?.summary ?? 'Works')
        : detail
          ? getFirstSentence(detail)
          : (check?.summary ?? `Failed with status ${response.status}`);
    return (
        <Tooltip
            label={detail}
            disabled={!detail}
            multiline
            maw={320}
            withinPortal
        >
            <Group gap={4} wrap="nowrap" role="status" c={ok ? 'green' : 'red'}>
                <MantineIcon
                    icon={ok ? IconCircleCheckFilled : IconAlertCircleFilled}
                    size={12}
                    className={classes.testOutcomeIcon}
                />
                <Text span inherit truncate>
                    {message}
                </Text>
            </Group>
        </Tooltip>
    );
};
