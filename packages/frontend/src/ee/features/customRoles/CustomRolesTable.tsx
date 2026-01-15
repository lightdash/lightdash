import { formatDate, type RoleWithScopes } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Menu,
    Paper,
    Table,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine/hooks';
import { IconDots, IconEdit, IconTrash } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import { useIsTruncated } from '../../../hooks/useIsTruncated';
import { CustomRolesDeleteModal } from './CustomRolesDeleteModal';

const TableRow: FC<{
    role: RoleWithScopes;
    onClickEdit: (role: RoleWithScopes) => void;
    onClickDelete: (role: RoleWithScopes) => void;
}> = ({ role, onClickDelete }) => {
    const { name, description, createdAt } = role;
    console.log('description', description);
    const { ref: nameRef, isTruncated: isNameTruncated } =
        useIsTruncated<HTMLDivElement>();
    const { ref: descriptionRef, isTruncated: isDescriptionTruncated } =
        useIsTruncated<HTMLDivElement>();

    return (
        <Table.Tr>
            <Table.Td>
                <Tooltip label={name} disabled={!isNameTruncated}>
                    <Box>
                        <Text fw={500} maw={300} fz="sm" truncate ref={nameRef}>
                            {name}
                        </Text>
                    </Box>
                </Tooltip>
            </Table.Td>
            <Table.Td>
                <Tooltip
                    label={description || ''}
                    disabled={!isDescriptionTruncated}
                >
                    <Box>
                        <Text
                            fw={500}
                            maw={400}
                            fz="sm"
                            truncate
                            ref={descriptionRef}
                        >
                            {description || ''}
                        </Text>
                    </Box>
                </Tooltip>
            </Table.Td>
            <Table.Td>{createdAt ? formatDate(createdAt) : '-'}</Table.Td>
            <Table.Td w="1%">
                <Menu withinPortal position="bottom-end">
                    <Menu.Target>
                        <ActionIcon
                            variant="transparent"
                            size="sm"
                            color="ldGray.6"
                        >
                            <MantineIcon icon={IconDots} />
                        </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconEdit} />}
                            component={Link}
                            to={`/generalSettings/customRoles/${role.roleUuid}`}
                        >
                            Edit
                        </Menu.Item>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconTrash} />}
                            color="red"
                            onClick={() => onClickDelete(role)}
                        >
                            Delete
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            </Table.Td>
        </Table.Tr>
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
    const { cx, classes } = useTableStyles();
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
            <Paper withBorder style={{ overflow: 'hidden' }}>
                <Table className={cx(classes.root, classes.alignLastTdRight)}>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Name</Table.Th>
                            <Table.Th>Description</Table.Th>
                            <Table.Th>Created</Table.Th>
                            <Table.Th></Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {roles.map((role) => (
                            <TableRow
                                key={role.roleUuid}
                                role={role}
                                onClickEdit={onEdit}
                                onClickDelete={handleOpenDeleteModal}
                            />
                        ))}
                    </Table.Tbody>
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
