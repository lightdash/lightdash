import { type Project } from '@lightdash/common';
import { Button, Flex, Group, Stack, Text, Tooltip } from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconHelp } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { z } from 'zod';
import MantineIcon from '../common/MantineIcon';
import TimeZonePicker from '../common/TimeZonePicker';

export const schedulerSettingsSchema = z.object({
    timezone: z.string(),
});

type Props = {
    isLoading: boolean;
    project?: Project;
    onSubmit: (data: z.infer<typeof schedulerSettingsSchema>) => void;
};

const SchedulerSettingsForm: FC<Props> = ({ isLoading, project, onSubmit }) => {
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
            <Stack w="100%">
                <TimeZonePicker
                    label={
                        <Group display="inline-flex" spacing="xs">
                            Default time zone
                            <Tooltip
                                maw={400}
                                label={
                                    <Text fw={400}>
                                        Default time zone for the project's
                                        scheduled deliveries
                                    </Text>
                                }
                                multiline
                            >
                                <MantineIcon icon={IconHelp} color="gray.6" />
                            </Tooltip>
                        </Group>
                    }
                    size="sm"
                    variant="default"
                    maw="100%"
                    searchable
                    {...form.getInputProps('timezone')}
                />
                <Flex justify="end" align="center" gap="sm">
                    <Button
                        type="submit"
                        disabled={!form.isValid() || !hasChanged}
                        loading={isLoading}
                    >
                        Update
                    </Button>
                </Flex>
            </Stack>
        </form>
    );
};

export default SchedulerSettingsForm;
