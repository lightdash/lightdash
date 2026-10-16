import { getAppDisplayName } from '@lightdash/common';
import { type ModalProps } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('modals');
    const { health } = useApp();
    const softDeleteEnabled = health.data?.softDelete.enabled;
    const retentionDays = health.data?.softDelete.retentionDays;

    const { mutateAsync: deleteApp, isLoading: isDeleting } = useDeleteApp();

    const handleConfirm = async () => {
        await deleteApp({ projectUuid, appUuid: uuid });
        onConfirm?.();
    };

    const description = softDeleteEnabled
        ? t('appDelete.softDeleteDescription', { count: retentionDays })
        : t('appDelete.permanentDescription');

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('appDelete.title')}
            variant="delete"
            resourceType={t('resourceTypes.app')}
            resourceLabel={getAppDisplayName(name, uuid)}
            description={description}
            onConfirm={handleConfirm}
            confirmLoading={isDeleting}
            cancelDisabled={isDeleting}
        />
    );
};

export default AppDeleteModal;
