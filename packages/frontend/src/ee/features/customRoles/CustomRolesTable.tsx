import { Button, createStyles, Group, Paper, Table } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { useState, type FC } from 'react';

import { formatDate, type RoleWithScopes } from '@lightdash/common';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import { CustomRolesDeleteModal } from './CustomRolesDeleteModal';

const useStyles = createStyles((theme) => ({
    scopeDescription: {
        color: theme.colors.ldDark[2],
    },
    row: {
        '& td': {
            maxWidth: 400,
        },
    },
}));

const TableRow: FC<{
    role: RoleWithScopes;
    onClickEdit: (role: RoleWithScopes) => void;
    onClickDelete: (role: RoleWithScopes) => void;
}> = ({ role, onClickDelete }) => {
    const { name, description, createdAt } = role;
    const { classes } = useStyles();

    return (
        <tr className={classes.row}>
            <td>{name}</td>
            <td className={classes.scopeDescription}>{description || ''}</td>
            <td>{createdAt ? formatDate(createdAt) : '-'}</td>
            <td>
                <Group spacing="xs" position="right">
                    <Button
                        component={Link}
                        to={`/generalSettings/customRoles/${role.roleUuid}`}
                        px="xs"
                        variant="outline"
                        size="xs"
                        color="blue"
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
    onEdit: (role: RoleWithScopes) => void;
    isDeleting: boolean;
};

export const CustomRolesTable: FC<TableProps> = ({
    roles,
    onDelete,
    onEdit,
    isDeleting,
}) => {
    const { classes } = useTableStyles();
    const [deleteOpened, { open: openDelete, close: closeDelete }] =
        useDisclosure(false);
    const [roleToDelete, setRoleToDelete] = useState<
        RoleWithScopes | undefined
    >();

    const handleDelete = async () => {
        if (roleToDelete) {
            onDelete(roleToDelete.roleUuid);
            setRoleToDelete(undefined);
            closeDelete();
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
                                onClickEdit={onEdit}
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
        </>
    );
};
