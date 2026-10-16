import { formatDate, type RoleWithScopes } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Group,
    Menu,
    Paper,
    Table,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
    IconDots,
    IconEdit,
    IconTrash,
} from '@tabler/icons-react';
import { useMemo, useState, type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import tableStyles from '../../../hooks/styles/tableStyles.module.css';
import { useIsTruncated } from '../../../hooks/useIsTruncated';
import { CustomRolesDeleteModal } from './CustomRolesDeleteModal';

const TableRow: FC<{
    role: RoleWithScopes;
    onClickEdit: (role: RoleWithScopes) => void;
    onClickDelete: (role: RoleWithScopes) => void;
}> = ({ role, onClickDelete }) => {
    const { name, description, level, createdAt } = role;
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
            <Table.Td>
                <Badge>
                    {level === 'organization' ? 'Organization' : 'Project'}
                </Badge>
            </Table.Td>
            <Table.Td>{createdAt ? formatDate(createdAt) : '-'}</Table.Td>
            <Table.Td w="1%">
                <Menu position="bottom-end">
                    <Menu.Target>
                        <ActionIcon
                            variant="transparent"
                            size="sm"
                            aria-label={`Actions for ${name}`}
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

type SortField = 'name' | 'createdAt';
type SortDirection = 'asc' | 'desc';

const compareRoles = (
    a: RoleWithScopes,
    b: RoleWithScopes,
    field: SortField,
): number => {
    if (field === 'createdAt') {
        return (
            new Date(a.createdAt ?? 0).getTime() -
            new Date(b.createdAt ?? 0).getTime()
        );
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
};

const SortableTh: FC<{
    field: SortField;
    sortField: SortField;
    sortDirection: SortDirection;
    onSort: (field: SortField) => void;
    children: ReactNode;
}> = ({ field, sortField, sortDirection, onSort, children }) => {
    const isActive = field === sortField;
    return (
        <Table.Th
            aria-sort={
                isActive
                    ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                    : 'none'
            }
        >
            <UnstyledButton onClick={() => onSort(field)} fz="inherit">
                <Group gap="two" wrap="nowrap">
                    {children}
                    {isActive ? (
                        <MantineIcon
                            icon={
                                sortDirection === 'asc'
                                    ? IconArrowUp
                                    : IconArrowDown
                            }
                            color="blue.6"
                        />
                    ) : (
                        <MantineIcon icon={IconArrowsSort} color="ldGray.5" />
                    )}
                </Group>
            </UnstyledButton>
        </Table.Th>
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
    const [deleteOpened, { open: openDelete, close: closeDelete }] =
        useDisclosure(false);
    const [roleToDelete, setRoleToDelete] = useState<
        RoleWithScopes | undefined
    >();
    const [sortField, setSortField] = useState<SortField>('name');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    const sortedRoles = useMemo(
        () =>
            roles
                .slice()
                .sort(
                    (a, b) =>
                        compareRoles(a, b, sortField) *
                        (sortDirection === 'asc' ? 1 : -1),
                ),
        [roles, sortField, sortDirection],
    );

    const handleSort = (field: SortField) => {
        if (field === sortField) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

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
            <Paper className={tableStyles.paper}>
                <Table.ScrollContainer minWidth={720}>
                    <Table
                        className={`${tableStyles.root} ${tableStyles.alignLastTdRight}`}
                    >
                        <Table.Thead>
                            <Table.Tr>
                                <SortableTh
                                    field="name"
                                    sortField={sortField}
                                    sortDirection={sortDirection}
                                    onSort={handleSort}
                                >
                                    Name
                                </SortableTh>
                                <Table.Th>Description</Table.Th>
                                <Table.Th>Type</Table.Th>
                                <SortableTh
                                    field="createdAt"
                                    sortField={sortField}
                                    sortDirection={sortDirection}
                                    onSort={handleSort}
                                >
                                    Created
                                </SortableTh>
                                <Table.Th></Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {sortedRoles.map((role) => (
                                <TableRow
                                    key={role.roleUuid}
                                    role={role}
                                    onClickEdit={onEdit}
                                    onClickDelete={handleOpenDeleteModal}
                                />
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
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
