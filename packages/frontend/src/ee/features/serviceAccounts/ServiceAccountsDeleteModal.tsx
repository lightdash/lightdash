import { Button, Text } from '@mantine-8/core';
import { IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';

import { type ServiceAccount } from '@lightdash/common';
import MantineModal from '../../../components/common/MantineModal';

type Props = {
    isDeleting: boolean;
    isOpen: boolean;
    onClose: () => void;
    onDelete: (uuid: string) => void;
    serviceAccount: ServiceAccount;
};

export const ServiceAccountsDeleteModal: FC<Props> = ({
    isDeleting,
    isOpen,
    onClose,
    onDelete,
    serviceAccount,
}) => {
    return (
        <MantineModal
            opened={isOpen}
            onClose={onClose}
            title="Delete service account"
            icon={IconTrash}
            cancelDisabled={isDeleting}
            actions={
                <Button
                    color="red"
                    loading={isDeleting}
                    onClick={() => {
                        onDelete(serviceAccount?.uuid ?? '');
                    }}
                >
                    Delete
                </Button>
            }
        >
            <Text fz="sm">
                Are you sure? This will permanently delete the{' '}
                <Text fw={600} component="span">
                    {serviceAccount?.description}
                </Text>{' '}
                service account.
            </Text>
        </MantineModal>
    );
};
