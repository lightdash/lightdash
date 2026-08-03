import { Button } from '@mantine/core';
import { IconPlayerPause } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';

type ConfirmPauseSchedulerModalProps = {
    opened: boolean;
    schedulerName: string;
    loading?: boolean;
    onClose: () => void;
    onConfirm: () => void;
    description: string;
};

const ConfirmPauseSchedulerModal: FC<ConfirmPauseSchedulerModalProps> = ({
    opened,
    schedulerName,
    loading,
    onClose,
    onConfirm,
    description,
}) => {
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={`Pause "${schedulerName}"?`}
            icon={IconPlayerPause}
            size="md"
            actions={
                <Button onClick={onConfirm} loading={loading}>
                    Pause
                </Button>
            }
            description={description}
        />
    );
};

export default ConfirmPauseSchedulerModal;
