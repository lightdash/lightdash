import { Button, Group, Paper, Table } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { useState, type FC } from 'react';

import { formatDate, type RoleWithScopes } from '@lightdash/common';
import MantineIcon from '../../../components/common/MantineIcon';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import { CustomRolesDeleteModal } from './CustomRolesDeleteModal';
import { CustomRolesEditModal } from './CustomRolesEditModal';

const TableRow: FC<{
    role: RoleWithScopes;
    onClickEdit: (role: RoleWithScopes) => void;
    onClickDelete: (role: RoleWithScopes) => void;
}> = ({ role, onClickEdit, onClickDelete }) => {
    const { name, description, createdAt } = role;

    return (
        <tr>
            <td>{name}</td>
            <td>{description || '-'}</td>
            <td>{createdAt ? formatDate(createdAt) : '-'}</td>
            <td>
                <Group spacing="xs" position="right">
                    <Button
                        px="xs"
                        variant="outline"
                        size="xs"
                        color="blue"
                        onClick={() => onClickEdit(role)}
                    >
                        <MantineIcon icon={IconEdit} />
                    </Button>
                    <Button
                        px="xs"
                        variant="outline"
                        size="xs"
                        color="red"
                        onClick={() => onClickDelete(role)}
                    >
                        <MantineIcon icon={IconTrash} />
                    </Button>
                </Group>
            </td>
        </tr>
    );
};

type TableProps = {
    roles: RoleWithScopes[];
    onDelete: (uuid: string) => void;
    onEdit: (
        uuid: string,
        values: { name: string; description?: string },
    ) => void;
    isDeleting: boolean;
    isEditing: boolean;
};

export const CustomRolesTable: FC<TableProps> = ({
    roles,
    onDelete,
    onEdit,
    isDeleting,
    isEditing,
}) => {
    const { classes } = useTableStyles();
    const [deleteOpened, { open: openDelete, close: closeDelete }] =
        useDisclosure(false);
    const [editOpened, { open: openEdit, close: closeEdit }] =
        useDisclosure(false);
    const [roleToDelete, setRoleToDelete] = useState<
        RoleWithScopes | undefined
    >();
    const [roleToEdit, setRoleToEdit] = useState<RoleWithScopes | undefined>();

    const handleDelete = async () => {
        if (roleToDelete) {
            onDelete(roleToDelete.roleUuid);
            setRoleToDelete(undefined);
            closeDelete();
        }
    };

    const handleEdit = async (values: {
        name: string;
        description?: string;
    }) => {
        if (roleToEdit) {
            onEdit(roleToEdit.roleUuid, values);
            setRoleToEdit(undefined);
            closeEdit();
        }
    };

    const handleOpenDeleteModal = (role: RoleWithScopes) => {
        setRoleToDelete(role);
        openDelete();
    };

    const handleCloseDeleteModal = () => {
        setRoleToDelete(undefined);
        closeDelete();
    };

    const handleOpenEditModal = (role: RoleWithScopes) => {
        setRoleToEdit(role);
        openEdit();
    };

    const handleCloseEditModal = () => {
        setRoleToEdit(undefined);
        closeEdit();
    };

    return (
        <>
            <Paper withBorder>
                <Table className={classes.root}>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Description</th>
                            <th>Created</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {roles.map((role) => (
                            <TableRow
                                key={role.roleUuid}
                                role={role}
                                onClickEdit={handleOpenEditModal}
                                onClickDelete={handleOpenDeleteModal}
                            />
                        ))}
                    </tbody>
                </Table>
            </Paper>

            {roleToDelete && (
                <CustomRolesDeleteModal
                    isOpen={deleteOpened}
                    onClose={handleCloseDeleteModal}
                    isDeleting={isDeleting}
                    onDelete={handleDelete}
                    role={roleToDelete}
                />
            )}

            {roleToEdit && (
                <CustomRolesEditModal
                    isOpen={editOpened}
                    onClose={handleCloseEditModal}
                    isWorking={isEditing}
                    onSave={handleEdit}
                    role={roleToEdit}
                />
            )}
        </>
    );
};
