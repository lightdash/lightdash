import { Text } from '@mantine-8/core';
import { type FC } from 'react';

import { type RoleWithScopes } from '@lightdash/common';
import MantineModal from '../../../components/common/MantineModal';

type DeleteModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onDelete: () => void;
    isDeleting?: boolean;
    role: RoleWithScopes;
};

export const CustomRolesDeleteModal: FC<DeleteModalProps> = ({
    isOpen,
    onClose,
    onDelete,
    isDeleting = false,
    role,
}) => {
    return (
        <MantineModal
            opened={isOpen}
            onClose={onClose}
            title="Delete custom role"
            variant="delete"
            resourceType="role"
            resourceLabel={role.name}
            cancelDisabled={isDeleting}
            onConfirm={onDelete}
            confirmLoading={isDeleting}
        >
            <Text fz="sm" c="dimmed">
                This action cannot be undone. Users and groups will no longer be
                able to use this role.
            </Text>
        </MantineModal>
    );
};
