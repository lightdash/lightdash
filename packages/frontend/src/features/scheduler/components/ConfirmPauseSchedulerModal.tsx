import { Button } from '@mantine/core';
import { IconPlayerPause } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('scheduler');
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('confirmPause.title', { name: schedulerName })}
            icon={IconPlayerPause}
            size="md"
            actions={
                <Button onClick={onConfirm} loading={loading}>
                    {t('confirmPause.pause')}
                </Button>
            }
            description={description}
        />
    );
};

export default ConfirmPauseSchedulerModal;
