import { Button } from '@mantine-8/core';
import { IconPlayerPause } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
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
            icon={<MantineIcon icon={IconPlayerPause} />}
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
