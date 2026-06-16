import { Button } from '@mantine-8/core';
import { IconSend } from '@tabler/icons-react';
import { type FC } from 'react';
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

const DESCRIPTION_BY_TYPE: Record<SchedulerDeliveryType, string> = {
    scheduled:
        'This will trigger the scheduled delivery immediately. It will not change or affect the configured schedule or future deliveries.',
    alert: 'This will evaluate the alert and send it immediately if the threshold is met. It will not change or affect the configured schedule.',
};

const ConfirmSendNowModal: FC<ConfirmSendNowModalProps> = ({
    opened,
    schedulerName,
    deliveryType,
    loading,
    onClose,
    onConfirm,
}) => {
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={`Send “${schedulerName}” now?`}
            icon={IconSend}
            size="md"
            actions={
                <Button onClick={onConfirm} loading={loading}>
                    Send now
                </Button>
            }
            description={DESCRIPTION_BY_TYPE[deliveryType]}
        />
    );
};

export default ConfirmSendNowModal;
