import { Button, Text } from '@mantine-8/core';
import { IconTrash } from '@tabler/icons-react';
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
            icon={IconTrash}
            cancelDisabled={isDeleting}
            actions={
                <Button color="red" onClick={onDelete} loading={isDeleting}>
                    Delete role
                </Button>
            }
        >
            <Text fz="sm">
                Are you sure you want to delete the role{' '}
                <Text component="span" fw={700}>
                    {role.name}
                </Text>
                ?
            </Text>
            <Text fz="sm" c="dimmed">
                This action cannot be undone. Users and groups will no longer be
                able to use this role.
            </Text>
        </MantineModal>
    );
};
