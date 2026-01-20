import { Button } from '@mantine-8/core';
import { IconPlayerPause } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';

type ConfirmPauseSchedulerModalProps = {
    opened: boolean;
    schedulerName: string;
    loading?: boolean;
    onClose: () => void;
    onConfirm: () => void;
};

const ConfirmPauseSchedulerModal: FC<ConfirmPauseSchedulerModalProps> = ({
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
            title={`Pause "${schedulerName}"?`}
            icon={IconPlayerPause}
            size="md"
            actions={
                <Button onClick={onConfirm} loading={loading}>
                    Pause
                </Button>
            }
            description="This will pause the scheduled delivery. It will not run until it is enabled again."
        />
    );
};

export default ConfirmPauseSchedulerModal;
