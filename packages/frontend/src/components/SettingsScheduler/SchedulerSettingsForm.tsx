import { type Project, type UpdateSchedulerSettings } from '@lightdash/common';
import {
    Group,
    Stack,
    Switch,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDebouncedCallback } from '@mantine/hooks';
import { IconHelp } from '@tabler/icons-react';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('projectSettings');
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
                        {t('scheduler.form.timezone.label')}
                        <Tooltip
                            maw={400}
                            label={
                                <Text fz="xs">
                                    {t('scheduler.form.timezone.tooltip')}
                                </Text>
                            }
                            multiline
                        >
                            <MantineIcon
                                icon={IconHelp}
                                color="dimmed"
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
                <Title order={6}>{t('scheduler.form.errorHandling')}</Title>

                <Switch
                    size="xs"
                    label={t('scheduler.form.notifyRecipients.label')}
                    description={t(
                        'scheduler.form.notifyRecipients.description',
                    )}
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
                        label={t('scheduler.form.includeContact.label')}
                        description={t(
                            'scheduler.form.includeContact.description',
                        )}
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
                        label={t('scheduler.form.contactOverride.label')}
                        description={t(
                            'scheduler.form.contactOverride.description',
                        )}
                        placeholder={t(
                            'scheduler.form.contactOverride.placeholder',
                        )}
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
