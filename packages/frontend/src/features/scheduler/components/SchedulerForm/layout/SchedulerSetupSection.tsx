import { Divider, Stack } from '@mantine-8/core';
import { type FC } from 'react';
import classes from './SchedulerDeliveryModal.module.css';
import { SchedulerRecipientsSection } from './SchedulerRecipientsSection';
import { SchedulerScheduleSection } from './SchedulerScheduleSection';

type Props = {
    isThresholdAlert?: boolean;
};

export const SchedulerSetupSection: FC<Props> = ({ isThresholdAlert }) => (
    <Stack gap="lg">
        <SchedulerScheduleSection isThresholdAlert={isThresholdAlert} />
        <Divider />
        <Stack gap="sm">
            <span className={classes.subBlockLabel}>Recipients</span>
            <SchedulerRecipientsSection />
        </Stack>
    </Stack>
);
