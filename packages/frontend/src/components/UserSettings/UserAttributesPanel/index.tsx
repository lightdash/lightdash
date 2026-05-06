import { subject } from '@casl/ability';
import { FeatureFlags, type UserAttribute } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Group,
    Menu,
    Stack,
    Text,
    Title,
    Tooltip,
    useMantineTheme,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
    IconDots,
    IconEdit,
    IconInfoCircle,
    IconTrash,
} from '@tabler/icons-react';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
} from 'mantine-react-table';
import { useMemo, useState, type FC } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import {
    useUserAttributes,
    useUserAttributesDeleteMutation,
} from '../../../hooks/useUserAttributes';
import useApp from '../../../providers/App/useApp';
import EmptyStateLoader from '../../common/EmptyStateLoader';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import ForbiddenPanel from '../../ForbiddenPanel';
import UserAttributeModal from './UserAttributeModal';
import { UserAttributesTopToolbar } from './UserAttributesTopToolbar';

const UserAttributesPanel: FC = () => {
    const theme = useMantineTheme();
    const { user } = useApp();
    const userGroupsFeatureFlagQuery = useServerFeatureFlag(
        FeatureFlags.UserGroupsEnabled,
    );
    const [showAddAttributeModal, addAttributeModal] = useDisclosure(false);
    const [deleteAttribute, setDeleteAttribute] = useState<
        UserAttribute | undefined
    >();
    const [editAttribute, setEditAttribute] = useState<
        UserAttribute | undefined
    >();
    const [searchQuery, setSearchQuery] = useState('');

    const { data: orgUserAttributes, isInitialLoading } = useUserAttributes();
    const { data: organization } = useOrganization();
    const { mutate: deleteUserAttribute } = useUserAttributesDeleteMutation();

    const isGroupManagementEnabled =
        userGroupsFeatureFlagQuery.data?.enabled ?? false;

    const columns: MRT_ColumnDef<UserAttribute>[] = useMemo(
        () => [
            {
                accessorKey: 'name',
                header: 'Attribute name',
                enableSorting: false,
                size: 380,
                Cell: ({ row }) => {
                    const attribute = row.original;
                    return (
                        <Stack gap="xs">
                            <Group gap="two">
                                <Text fw={500} fz="sm">
                                    {attribute.name}
                                </Text>
                                {attribute.description && (
                                    <Tooltip
                                        multiline
                                        maw={300}
                                        withArrow
                                        label={attribute.description}
                                    >
                                        <Box>
                                            <MantineIcon
                                                icon={IconInfoCircle}
                                                color="ldGray.6"
                                            />
                                        </Box>
                                    </Tooltip>
                                )}
                            </Group>
                            <Group gap="sm">
                                <Text fz="xs" c="ldGray.6">
                                    {attribute.users.length} user
                                    {attribute.users.length !== 1 ? 's' : ''}
                                </Text>
                                {isGroupManagementEnabled && (
                                    <Text fz="xs" c="ldGray.6">
                                        {attribute.groups.length} group
                                        {attribute.groups.length !== 1
                                            ? 's'
                                            : ''}
                                    </Text>
                                )}
                            </Group>
                        </Stack>
                    );
                },
            },
            {
                id: 'actions',
                header: '',
                enableSorting: false,
                size: 20,
                maxSize: 20,
                grow: false,
                Cell: ({ row }) => {
                    const attribute = row.original;
                    return (
                        <Box
                            component="div"
                            onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                                e.stopPropagation();
                                e.preventDefault();
                            }}
                        >
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
                                        leftSection={
                                            <MantineIcon icon={IconEdit} />
                                        }
                                        onClick={() =>
                                            setEditAttribute(attribute)
                                        }
                                    >
                                        Edit
                                    </Menu.Item>
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon icon={IconTrash} />
                                        }
                                        color="red"
                                        onClick={() =>
                                            setDeleteAttribute(attribute)
                                        }
                                    >
                                        Delete
                                    </Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                        </Box>
                    );
                },
            },
        ],
        [isGroupManagementEnabled],
    );

    const tableData = useMemo(() => {
        const all = orgUserAttributes ?? [];
        if (!searchQuery.trim()) return all;
        const lower = searchQuery.toLowerCase();
        return all.filter(
            (attr) =>
                attr.name.toLowerCase().includes(lower) ||
                attr.description?.toLowerCase().includes(lower),
        );
    }, [orgUserAttributes, searchQuery]);

    const table = useMantineReactTable({
        columns,
        data: tableData,
        enableColumnResizing: false,
        enableRowNumbers: false,
        enablePagination: false,
        enableFilters: false,
        enableFullScreenToggle: false,
        enableDensityToggle: false,
        enableColumnActions: false,
        enableColumnFilters: false,
        enableHiding: false,
        enableGlobalFilterModes: false,
        enableSorting: false,
        enableTopToolbar: true,
        enableBottomToolbar: false,
        mantinePaperProps: {
            shadow: undefined,
            style: {
                border: `1px solid ${theme.colors.ldGray[2]}`,
                borderRadius: theme.spacing.sm,
                boxShadow: theme.shadows.subtle,
                display: 'flex',
                flexDirection: 'column',
            },
        },
        mantineTableHeadRowProps: {
            style: {
                boxShadow: 'none',
            },
        },
        mantineTableContainerProps: {
            style: { maxHeight: 'calc(100dvh - 420px)' },
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: Boolean(tableData.length),
        },
        mantineTableHeadCellProps: (props) => {
            const isLastColumn =
                props.table.getAllColumns().indexOf(props.column) ===
                props.table.getAllColumns().length - 1;

            return {
                bg: 'ldGray.0',
                h: '3xl',
                pos: 'relative',
                style: {
                    userSelect: 'none',
                    padding: `${theme.spacing.xs} ${theme.spacing.xl}`,
                    borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                    borderRight: props.column.getIsResizing()
                        ? `2px solid ${theme.colors.blue[3]}`
                        : `1px solid ${
                              isLastColumn
                                  ? 'transparent'
                                  : theme.colors.ldGray[2]
                          }`,
                    borderTop: 'none',
                    borderLeft: 'none',
                },
            };
        },
        mantineTableBodyCellProps: () => {
            return {
                style: {
                    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
                    borderRight: 'none',
                    borderLeft: 'none',
                    borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                    borderTop: 'none',
                },
            };
        },
        renderTopToolbar: () => (
            <UserAttributesTopToolbar
                onAddClick={addAttributeModal.open}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
            />
        ),
        renderEmptyRowsFallback: () =>
            searchQuery.trim() ? (
                <Text fz="sm" c="ldGray.6" ta="center" py="xl">
                    No attributes match your search.
                </Text>
            ) : (
                <Text fz="sm" c="ldGray.6" ta="center" py="xl">
                    There's no user attributes defined yet. <br /> To learn how
                    to define user attributes, check out our{' '}
                    <Anchor
                        href="https://docs.lightdash.com/references/user-attributes"
                        target="_blank"
                        rel="noreferrer"
                        fz="sm"
                        fw="bold"
                    >
                        documentation
                    </Anchor>
                    .
                </Text>
            ),
        icons: {
            IconArrowsSort: () => (
                <MantineIcon icon={IconArrowsSort} size="md" color="ldGray.5" />
            ),
            IconSortAscending: () => (
                <MantineIcon icon={IconArrowUp} size="md" color="blue.6" />
            ),
            IconSortDescending: () => (
                <MantineIcon icon={IconArrowDown} size="md" color="blue.6" />
            ),
        },
        state: {
            isLoading: isInitialLoading,
            density: 'md',
        },
    });

    if (
        user.data?.ability.cannot(
            'manage',
            subject('Organization', {
                organizationUuid: organization?.organizationUuid,
            }),
        )
    ) {
        return <ForbiddenPanel />;
    }

    if (isInitialLoading) {
        return <EmptyStateLoader my="xl" title="Loading user attributes" />;
    }

    if (!user.data) return null;

    return (
        <>
            <Stack gap="sm">
                <Group gap="xs" align="center" pb="xs">
                    <Title order={5}>
                        {isGroupManagementEnabled
                            ? 'User and group attributes'
                            : 'User attributes'}
                    </Title>
                    <Tooltip
                        multiline
                        w={400}
                        withArrow
                        position="bottom-start"
                        label={
                            <Box>
                                User attributes are metadata defined by your
                                organization. They can be used to control and
                                customize the user experience through data
                                access and personalization. Learn more about
                                using user attributes by clicking on this icon.
                            </Box>
                        }
                    >
                        <ActionIcon
                            component="a"
                            href="https://docs.lightdash.com/references/user-attributes"
                            target="_blank"
                            rel="noreferrer"
                            variant="subtle"
                            size="xs"
                            color="ldGray.6"
                        >
                            <MantineIcon icon={IconInfoCircle} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
                <MantineReactTable table={table} />
            </Stack>

            <UserAttributeModal
                opened={showAddAttributeModal}
                onClose={addAttributeModal.close}
                allUserAttributes={orgUserAttributes || []}
            />

            {editAttribute !== undefined && (
                <UserAttributeModal
                    opened={true}
                    userAttribute={editAttribute}
                    onClose={() => setEditAttribute(undefined)}
                    allUserAttributes={orgUserAttributes || []}
                />
            )}

            {deleteAttribute !== undefined && (
                <MantineModal
                    opened={true}
                    onClose={() => setDeleteAttribute(undefined)}
                    title="Delete user attribute"
                    variant="delete"
                    resourceType="user attribute"
                    resourceLabel={deleteAttribute.name}
                    onConfirm={() => {
                        deleteUserAttribute(deleteAttribute.uuid);
                        setDeleteAttribute(undefined);
                    }}
                />
            )}
        </>
    );
};

export default UserAttributesPanel;
