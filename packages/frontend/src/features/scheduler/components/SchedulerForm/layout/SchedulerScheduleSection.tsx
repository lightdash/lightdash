import { formatMinutesOffset, getTzMinutesOffset } from '@lightdash/common';
import { Box, Input, Stack, TextInput } from '@mantine-8/core';
import { useMemo, type FC } from 'react';
import TimeZonePicker from '../../../../../components/common/TimeZonePicker';
import { CronInternalInputs } from '../../../../../components/CronInput';
import { useActiveProjectUuid } from '../../../../../hooks/useActiveProject';
import { useProject } from '../../../../../hooks/useProject';
import { useSchedulerFormContext } from '../schedulerFormContext';

export const SchedulerScheduleSection: FC = () => {
    const form = useSchedulerFormContext();
    const { activeProjectUuid } = useActiveProjectUuid();
    const { data: project } = useProject(activeProjectUuid);

    const projectDefaultOffsetString = useMemo(() => {
        if (!project) return undefined;
        const minsOffset = getTzMinutesOffset('UTC', project.schedulerTimezone);
        return formatMinutesOffset(minsOffset);
    }, [project]);

    return (
        <Stack gap="lg">
            <TextInput
                label="Name"
                placeholder="Name your delivery"
                required
                {...form.getInputProps('name')}
            />
            <Input.Wrapper label="Frequency">
                <Box mt={4}>
                    <CronInternalInputs
                        disabled={false}
                        {...form.getInputProps('cron')}
                        value={form.values.cron}
                        name="cron"
                    />
                </Box>
            </Input.Wrapper>
            <TimeZonePicker
                label="Timezone"
                size="sm"
                variant="default"
                w="100%"
                maw="100%"
                searchable
                clearable
                placeholder={`Project default ${
                    projectDefaultOffsetString
                        ? `(UTC ${projectDefaultOffsetString})`
                        : ''
                }`}
                {...form.getInputProps('timezone')}
            />
        </Stack>
    );
};
