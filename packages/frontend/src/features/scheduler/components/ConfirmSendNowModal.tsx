import { Button } from '@mantine-8/core';
import { IconSend } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';

type ConfirmSendNowModalProps = {
    opened: boolean;
    schedulerName: string;
    loading?: boolean;
    onClose: () => void;
    onConfirm: () => void;
};

const ConfirmSendNowModal: FC<ConfirmSendNowModalProps> = ({
    opened,
    schedulerName,
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
            description="This will trigger the scheduled delivery immediately. It will not change or affect the configured schedule or future deliveries."
        />
    );
};

export default ConfirmSendNowModal;
