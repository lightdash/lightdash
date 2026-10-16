import { type UserWarehouseCredentials } from '@lightdash/common';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useUserWarehouseCredentialsDeleteMutation } from '../../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import MantineModal, {
    type MantineModalProps,
} from '../../common/MantineModal';

type Props = Pick<MantineModalProps, 'opened' | 'onClose'> & {
    warehouseCredentialsToBeDeleted: UserWarehouseCredentials;
};

export const DeleteCredentialsModal: FC<Props> = ({
    opened,
    onClose,
    warehouseCredentialsToBeDeleted,
}) => {
    const { t } = useTranslation('userSettings');
    const { mutateAsync, isLoading: isDeleting } =
        useUserWarehouseCredentialsDeleteMutation(
            warehouseCredentialsToBeDeleted.uuid,
        );

    const handleConfirm = async () => {
        await mutateAsync();
        onClose();
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t(
                'myWarehouseConnectionsPanel.deleteCredentialsModal.title',
            )}
            variant="delete"
            resourceType={t(
                'myWarehouseConnectionsPanel.deleteCredentialsModal.resourceType',
            )}
            resourceLabel={warehouseCredentialsToBeDeleted.name}
            cancelDisabled={isDeleting}
            onConfirm={handleConfirm}
            confirmLoading={isDeleting}
        />
    );
};
