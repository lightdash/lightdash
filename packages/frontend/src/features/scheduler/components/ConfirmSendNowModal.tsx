import { Button } from '@mantine/core';
import { IconSend } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineModal from '../../../components/common/MantineModal';
import { type SchedulerDeliveryType } from './types';

type ConfirmSendNowModalProps = {
    opened: boolean;
    schedulerName: string;
    deliveryType: SchedulerDeliveryType;
    loading?: boolean;
    onClose: () => void;
    onConfirm: () => void;
};

const DESCRIPTION_KEY_BY_TYPE: Record<SchedulerDeliveryType, string> = {
    scheduled: 'confirmSendNow.description.scheduled',
    alert: 'confirmSendNow.description.alert',
};

const ConfirmSendNowModal: FC<ConfirmSendNowModalProps> = ({
    opened,
    schedulerName,
    deliveryType,
    loading,
    onClose,
    onConfirm,
}) => {
    const { t } = useTranslation('scheduler');
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('confirmSendNow.title', { name: schedulerName })}
            icon={IconSend}
            size="md"
            actions={
                <Button onClick={onConfirm} loading={loading}>
                    {t('actionMenu.sendNow')}
                </Button>
            }
            description={t(DESCRIPTION_KEY_BY_TYPE[deliveryType])}
        />
    );
};

export default ConfirmSendNowModal;
