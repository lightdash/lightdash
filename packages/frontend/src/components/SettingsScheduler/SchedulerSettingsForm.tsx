import { type Project, type UpdateSchedulerSettings } from '@lightdash/common';
import { Box, Divider, Stack, Switch, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDebouncedCallback } from '@mantine/hooks';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { type FC } from 'react';
import { type z } from 'zod';
import { SettingRow } from '../common/Settings/SettingLayout';
import TimeZonePicker from '../common/TimeZonePicker';
import { schedulerSettingsSchema } from './types';

const CONTACT_OVERRIDE_DEBOUNCE_MS = 1000;

const normalizeContactOverride = (value: string): string | null => {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
};

type Props = {
    project?: Project;
    onChange: (changes: UpdateSchedulerSettings) => void;
};

export const SchedulerSettingsForm: FC<Props> = ({ project, onChange }) => {
    const form = useForm<z.infer<typeof schedulerSettingsSchema>>({
        validate: zodResolver(schedulerSettingsSchema),
        initialValues: {
            timezone: project?.schedulerTimezone ?? 'UTC',
            schedulerFailureNotifyRecipients:
                project?.schedulerFailureNotifyRecipients ?? false,
            schedulerFailureIncludeContact:
                project?.schedulerFailureIncludeContact ?? false,
            schedulerFailureContactOverride:
                project?.schedulerFailureContactOverride ?? '',
        },
    });

    // Persist contact-override edits a beat after the user stops typing.
    // Triggered directly from the TextInput's onChange — keeps the debounce
    // as a side effect of input events rather than derived-state-in-effect.
    const persistContactOverrideDebounced = useDebouncedCallback(
        (value: string) => {
            onChange({
                schedulerFailureContactOverride:
                    normalizeContactOverride(value),
            });
        },
        CONTACT_OVERRIDE_DEBOUNCE_MS,
    );

    const notifyEnabled = form.values.schedulerFailureNotifyRecipients;
    const contactIncluded = form.values.schedulerFailureIncludeContact;

    return (
        <Stack gap="md">
            <SettingRow
                title="Default time zone"
                description="Default time zone for the project's scheduled deliveries."
                control={
                    <TimeZonePicker
                        aria-label="Default time zone"
                        size="xs"
                        variant="default"
                        w={{ base: '100%', sm: 260 }}
                        maw="100%"
                        searchable
                        {...form.getInputProps('timezone')}
                        onChange={(value) => {
                            if (!value || value === form.values.timezone)
                                return;
                            form.setFieldValue('timezone', value);
                            onChange({ schedulerTimezone: value });
                        }}
                    />
                }
            />

            <Divider />

            <SettingRow
                title="Notify recipients if a delivery fails"
                description="When a scheduled delivery fails, send a minimal failure message to every recipient (in addition to the existing email to the delivery owner)."
                control={
                    <Switch
                        aria-label="Notify recipients if a delivery fails"
                        size="md"
                        checked={notifyEnabled}
                        onChange={(event) => {
                            const next = event.currentTarget.checked;
                            form.setFieldValue(
                                'schedulerFailureNotifyRecipients',
                                next,
                            );
                            onChange({
                                schedulerFailureNotifyRecipients: next,
                            });
                        }}
                    />
                }
            />

            {notifyEnabled && (
                <>
                    <Divider />
                    <Box pl="xl">
                        <SettingRow
                            title="Include a contact in failure messages"
                            description="Add a line telling recipients who to contact about the failure."
                            control={
                                <Switch
                                    aria-label="Include a contact in failure messages"
                                    size="md"
                                    checked={contactIncluded}
                                    onChange={(event) => {
                                        const next =
                                            event.currentTarget.checked;
                                        form.setFieldValue(
                                            'schedulerFailureIncludeContact',
                                            next,
                                        );
                                        onChange({
                                            schedulerFailureIncludeContact:
                                                next,
                                        });
                                    }}
                                />
                            }
                        >
                            {contactIncluded && (
                                <TextInput
                                    mt="sm"
                                    size="xs"
                                    label="Custom contact sentence (optional)"
                                    description={`Replaces the default "You can also reach out to <delivery owner> for details." line appended to the failure message.`}
                                    placeholder="You can also reach out to data-support@example.com for details."
                                    value={
                                        form.values
                                            .schedulerFailureContactOverride
                                    }
                                    onChange={(event) => {
                                        const next = event.currentTarget.value;
                                        form.setFieldValue(
                                            'schedulerFailureContactOverride',
                                            next,
                                        );
                                        persistContactOverrideDebounced(next);
                                    }}
                                />
                            )}
                        </SettingRow>
                    </Box>
                </>
            )}
        </Stack>
    );
};
