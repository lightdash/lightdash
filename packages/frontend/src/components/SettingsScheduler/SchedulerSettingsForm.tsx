import { type Project } from '@lightdash/common';
import { Button, Group, Select, Text, Tooltip } from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconHelp } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { type z } from 'zod';
import MantineIcon from '../common/MantineIcon';
import TimeZonePicker from '../common/TimeZonePicker';
import { schedulerSettingsSchema } from './types';

const CJK_FONT_OPTIONS = [
    { value: '', label: 'None' },
    { value: 'ja', label: '日本語 (Japanese)' },
    { value: 'zh-CN', label: '中文简体 (Simplified Chinese)' },
    { value: 'zh-TW', label: '中文繁體 (Traditional Chinese)' },
    { value: 'ko', label: '한국어 (Korean)' },
];

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
            cjkFont: project?.schedulerCjkFont ?? '',
        },
    });

    const hasChanged = useMemo(
        () =>
            form.values.timezone !== project?.schedulerTimezone ||
            form.values.cjkFont !== (project?.schedulerCjkFont ?? ''),
        [
            form.values.timezone,
            form.values.cjkFont,
            project?.schedulerTimezone,
            project?.schedulerCjkFont,
        ],
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

                <Select
                    label={
                        <Group display="inline-flex" gap="xs">
                            CJK font rendering
                            <Tooltip
                                maw={400}
                                label={
                                    <Text fz="xs">
                                        Select a CJK font for correct glyph
                                        rendering in scheduled delivery images
                                        and PDFs
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
                    data={CJK_FONT_OPTIONS}
                    {...form.getInputProps('cjkFont')}
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
