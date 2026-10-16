import { formatMinutesOffset, getTzMinutesOffset } from '@lightdash/common';
import { Box, Input, Stack, TextInput } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import TimeZonePicker from '../../../../../components/common/TimeZonePicker';
import { CronInternalInputs } from '../../../../../components/CronInput';
import { useActiveProjectUuid } from '../../../../../hooks/useActiveProject';
import { useProject } from '../../../../../hooks/useProject';
import { useSchedulerFormContext } from '../schedulerFormContext';

type Props = {
    isThresholdAlert?: boolean;
};

export const SchedulerScheduleSection: FC<Props> = ({ isThresholdAlert }) => {
    const { t } = useTranslation('scheduler');
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
                label={t('setup.name')}
                placeholder={
                    isThresholdAlert
                        ? t('setup.namePlaceholderAlert')
                        : t('setup.namePlaceholderDelivery')
                }
                required
                {...form.getInputProps('name')}
            />
            <Input.Wrapper
                label={
                    isThresholdAlert
                        ? t('setup.checkFrequency')
                        : t('setup.frequency')
                }
                description={
                    isThresholdAlert
                        ? t('setup.checkFrequencyDescription')
                        : undefined
                }
            >
                <Box>
                    <CronInternalInputs
                        disabled={false}
                        {...form.getInputProps('cron')}
                        value={form.values.cron}
                        name="cron"
                    />
                </Box>
            </Input.Wrapper>
            <TimeZonePicker
                label={t('setup.timezone')}
                size="sm"
                variant="default"
                w="100%"
                maw="100%"
                searchable
                clearable
                placeholder={
                    projectDefaultOffsetString
                        ? t('setup.timezonePlaceholderWithOffset', {
                              offset: projectDefaultOffsetString,
                          })
                        : t('setup.timezonePlaceholder')
                }
                {...form.getInputProps('timezone')}
            />
        </Stack>
    );
};
