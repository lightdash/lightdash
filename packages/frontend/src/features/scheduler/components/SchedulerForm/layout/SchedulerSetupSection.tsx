import { Divider, Stack } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import classes from './SchedulerDeliveryModal.module.css';
import { SchedulerRecipientsSection } from './SchedulerRecipientsSection';
import { SchedulerScheduleSection } from './SchedulerScheduleSection';

type Props = {
    isThresholdAlert?: boolean;
};

export const SchedulerSetupSection: FC<Props> = ({ isThresholdAlert }) => {
    const { t } = useTranslation('scheduler');
    return (
        <Stack gap="lg">
            <SchedulerScheduleSection isThresholdAlert={isThresholdAlert} />
            <Divider />
            <Stack gap="sm">
                <span className={classes.subBlockLabel}>
                    {t('setup.recipients')}
                </span>
                <SchedulerRecipientsSection />
            </Stack>
        </Stack>
    );
};
