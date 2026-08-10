import { getAppDisplayName } from '@lightdash/common';
import { type ModalProps } from '@mantine/core';
import { type FC } from 'react';
import { useDeleteApp } from '../../../features/apps/hooks/useDeleteApp';
import useApp from '../../../providers/App/useApp';
import MantineModal from '../MantineModal';

interface AppDeleteModalProps extends Pick<ModalProps, 'opened' | 'onClose'> {
    projectUuid: string;
    uuid: string;
    name: string;
    /** What the copy calls the resource, e.g. "custom chart type" on surfaces
     *  that hide the data-app ancestry. */
    noun?: string;
    onConfirm?: () => void;
}

const AppDeleteModal: FC<AppDeleteModalProps> = ({
    opened,
    onClose,
    projectUuid,
    uuid,
    name,
    noun = 'app',
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
        ? `This ${noun} will be moved to Recently deleted and permanently removed after ${retentionDays} days.`
        : `This ${noun} and all of its versions will be permanently deleted, including any built artifacts in storage.`;

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={`Delete ${noun}`}
            variant="delete"
            resourceType="app"
            resourceLabel={getAppDisplayName(name, uuid)}
            description={description}
            onConfirm={handleConfirm}
            confirmLoading={isDeleting}
            cancelDisabled={isDeleting}
        />
    );
};

export default AppDeleteModal;
