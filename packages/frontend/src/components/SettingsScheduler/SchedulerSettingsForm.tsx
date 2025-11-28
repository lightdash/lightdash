import { type Project } from '@lightdash/common';
import { Button, Group, Text, Tooltip } from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconHelp } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { type z } from 'zod';
import MantineIcon from '../common/MantineIcon';
import TimeZonePicker from '../common/TimeZonePicker';
import { schedulerSettingsSchema } from './types';

type Props = {
    isLoading: boolean;
    project?: Project;
    onSubmit: (data: z.infer<typeof schedulerSettingsSchema>) => void;
};

export const SchedulerSettingsForm: FC<Props> = ({
    isLoading,
    project,
    onSubmit,
}) => {
    const form = useForm<z.infer<typeof schedulerSettingsSchema>>({
        validate: zodResolver(schedulerSettingsSchema),
        initialValues: {
            timezone: project?.schedulerTimezone ?? 'UTC',
        },
    });

    const hasChanged = useMemo(
        () => form.values.timezone !== project?.schedulerTimezone,
        [form.values.timezone, project?.schedulerTimezone],
    );

    return (
        <form onSubmit={form.onSubmit(onSubmit)}>
            <Group w="100%" gap="sm" align="flex-end">
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
                />

                <Button
                    type="submit"
                    size="xs"
                    disabled={!form.isValid() || !hasChanged}
                    loading={isLoading}
                >
                    Update
                </Button>
            </Group>
        </form>
    );
};
