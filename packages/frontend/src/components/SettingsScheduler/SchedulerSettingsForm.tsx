import { type Project, type UpdateSchedulerSettings } from '@lightdash/common';
import {
    Group,
    Stack,
    Switch,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { useDebouncedCallback } from '@mantine-8/hooks';
import { useForm, zodResolver } from '@mantine/form';
import { IconHelp } from '@tabler/icons-react';
import { type FC } from 'react';
import { type z } from 'zod';
import MantineIcon from '../common/MantineIcon';
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
            <TimeZonePicker
                label={
                    <Group display="inline-flex" gap="xs">
                        Default time zone
                        <Tooltip
                            maw={400}
                            label={
                                <Text fz="xs">
                                    Default time zone for the project's
                                    scheduled deliveries
                                </Text>
                            }
                            multiline
                        >
                            <MantineIcon
                                icon={IconHelp}
                                color="ldGray.6"
                                size="sm"
                            />
                        </Tooltip>
                    </Group>
                }
                size="xs"
                variant="default"
                maw="100%"
                searchable
                {...form.getInputProps('timezone')}
                onChange={(value) => {
                    if (!value || value === form.values.timezone) return;
                    form.setFieldValue('timezone', value);
                    onChange({ schedulerTimezone: value });
                }}
            />

            <Stack gap="sm">
                <Title order={6}>Error handling</Title>

                <Switch
                    size="xs"
                    label="Notify recipients if a delivery fails"
                    description="When a scheduled delivery fails, send a minimal failure message to every recipient (in addition to the existing email to the delivery owner)."
                    checked={notifyEnabled}
                    onChange={(event) => {
                        const next = event.currentTarget.checked;
                        form.setFieldValue(
                            'schedulerFailureNotifyRecipients',
                            next,
                        );
                        onChange({ schedulerFailureNotifyRecipients: next });
                    }}
                />

                {notifyEnabled && (
                    <Switch
                        size="xs"
                        label="Include a contact in failure messages"
                        description="Add a line telling recipients who to contact about the failure."
                        checked={contactIncluded}
                        onChange={(event) => {
                            const next = event.currentTarget.checked;
                            form.setFieldValue(
                                'schedulerFailureIncludeContact',
                                next,
                            );
                            onChange({
                                schedulerFailureIncludeContact: next,
                            });
                        }}
                    />
                )}

                {notifyEnabled && contactIncluded && (
                    <TextInput
                        size="xs"
                        label="Custom contact sentence (optional)"
                        description={`Replaces the default "You can also reach out to <delivery owner> for details." line appended to the failure message.`}
                        placeholder="You can also reach out to data-support@example.com for details."
                        value={form.values.schedulerFailureContactOverride}
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
            </Stack>
        </Stack>
    );
};
