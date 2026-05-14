import { type ModalProps } from '@mantine-8/core';
import { type FC } from 'react';
import { useDeleteApp } from '../../../features/apps/hooks/useDeleteApp';
import useApp from '../../../providers/App/useApp';
import MantineModal from '../MantineModal';

interface AppDeleteModalProps extends Pick<ModalProps, 'opened' | 'onClose'> {
    projectUuid: string;
    uuid: string;
    name: string;
    onConfirm?: () => void;
}

const AppDeleteModal: FC<AppDeleteModalProps> = ({
    opened,
    onClose,
    projectUuid,
    uuid,
    name,
    onConfirm,
}) => {
    const { health } = useApp();
    const softDeleteEnabled = health.data?.softDelete.enabled;
    const retentionDays = health.data?.softDelete.retentionDays;

    const { mutateAsync: deleteApp, isLoading: isDeleting } = useDeleteApp();

    const handleConfirm = async () => {
        await deleteApp({ projectUuid, appUuid: uuid });
        onConfirm?.();
    };

    const description = softDeleteEnabled
        ? `This app will be moved to Recently deleted and permanently removed after ${retentionDays} days.`
        : 'This app and all of its versions will be permanently deleted, including any built artifacts in storage.';

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Delete app"
            variant="delete"
            resourceType="app"
            resourceLabel={name || `Untitled app ${uuid.slice(0, 8)}`}
            description={description}
            onConfirm={handleConfirm}
            confirmLoading={isDeleting}
            cancelDisabled={isDeleting}
        />
    );
};

export default AppDeleteModal;
