import { formatDate, type RoleWithScopes } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Menu,
    Paper,
    Table,
    Text,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconDots, IconEdit, IconTrash } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('customRoles');
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
                    {level === 'organization'
                        ? t('levels.organization')
                        : t('levels.project')}
                </Badge>
            </Table.Td>
            <Table.Td>{createdAt ? formatDate(createdAt) : '-'}</Table.Td>
            <Table.Td w="1%">
                <Menu position="bottom-end">
                    <Menu.Target>
                        <ActionIcon
                            variant="transparent"
                            size="sm"
                            aria-label={t('table.actionsFor', { name })}
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
                            {t('actions.edit', { ns: 'common' })}
                        </Menu.Item>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconTrash} />}
                            color="red"
                            onClick={() => onClickDelete(role)}
                        >
                            {t('actions.delete', { ns: 'common' })}
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
    const { t } = useTranslation('customRoles');
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
            <Paper className={tableStyles.paper}>
                <Table.ScrollContainer minWidth={720}>
                    <Table
                        className={`${tableStyles.root} ${tableStyles.alignLastTdRight}`}
                    >
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>{t('table.name')}</Table.Th>
                                <Table.Th>{t('table.description')}</Table.Th>
                                <Table.Th>{t('table.type')}</Table.Th>
                                <Table.Th>{t('table.created')}</Table.Th>
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
