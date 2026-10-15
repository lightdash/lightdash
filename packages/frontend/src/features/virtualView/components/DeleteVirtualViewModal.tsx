import { Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import MantineModal from '../../../components/common/MantineModal';
import { useDeleteVirtualView } from '../../virtualView/hooks/useVirtualView';

export const DeleteVirtualViewModal = ({
    opened,
    onClose,
    virtualViewName,
    projectUuid,
}: {
    opened: boolean;
    onClose: () => void;
    virtualViewName: string;
    projectUuid: string;
}) => {
    const { t } = useTranslation('explorer');
    const { mutate, isLoading } = useDeleteVirtualView(projectUuid);
    const handleConfirm = () => {
        mutate({ projectUuid, name: virtualViewName });
        onClose();
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('virtualView.delete.title')}
            variant="delete"
            resourceType={t('virtualView.resourceType')}
            resourceLabel={virtualViewName}
            onConfirm={handleConfirm}
            confirmLoading={isLoading}
        >
            <Text fz="sm" c="dimmed">
                {t('virtualView.delete.description')}
            </Text>
        </MantineModal>
    );
};
