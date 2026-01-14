import { type UserWarehouseCredentials } from '@lightdash/common';
import { type FC } from 'react';
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
            title="Delete credentials"
            variant="delete"
            resourceType="credentials"
            resourceLabel={warehouseCredentialsToBeDeleted.name}
            cancelDisabled={isDeleting}
            onConfirm={handleConfirm}
            confirmLoading={isDeleting}
        />
    );
};
