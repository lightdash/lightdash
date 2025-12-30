import { type UserWarehouseCredentials } from '@lightdash/common';
import { Button, Text } from '@mantine-8/core';
import { IconTrash } from '@tabler/icons-react';
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

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Delete credentials"
            icon={IconTrash}
            cancelDisabled={isDeleting}
            actions={
                <Button
                    color="red"
                    onClick={async () => {
                        await mutateAsync();
                        onClose();
                    }}
                    loading={isDeleting}
                    disabled={isDeleting}
                >
                    Delete
                </Button>
            }
        >
            <Text fz="sm">
                Are you sure you want to delete credentials:{' '}
                <b>{warehouseCredentialsToBeDeleted.name}</b>?
            </Text>
        </MantineModal>
    );
};
