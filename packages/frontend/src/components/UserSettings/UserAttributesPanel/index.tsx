import { subject } from '@casl/ability';
import { FeatureFlags, type UserAttribute } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Group,
    Menu,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconDots,
    IconEdit,
    IconInfoCircle,
    IconPlus,
    IconTrash,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import {
    useUserAttributes,
    useUserAttributesDeleteMutation,
} from '../../../hooks/useUserAttributes';
import useApp from '../../../providers/App/useApp';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
} from '../../common/ContentTable';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import {
    SettingsPage,
    SettingsPageActions,
    SettingsPageDocumentationLink,
} from '../../common/Settings/SettingsPage';
import ForbiddenPanel from '../../ForbiddenPanel';
import UserAttributeModal from './UserAttributeModal';
import { UserAttributesTopToolbar } from './UserAttributesTopToolbar';

const UserAttributesPanel: FC = () => {
    const { t } = useTranslation('userSettings');
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

    const columns: ContentTableColumnDef<UserAttribute>[] = useMemo(
        () => [
            {
                accessorKey: 'name',
                header: t('userAttributesPanel.table.attributeName'),
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
                                        maw={300}
                                        label={attribute.description}
                                    >
                                        <Box>
                                            <MantineIcon
                                                icon={IconInfoCircle}
                                                color="dimmed"
                                            />
                                        </Box>
                                    </Tooltip>
                                )}
                            </Group>
                            <Group gap="sm">
                                <Text fz="xs" c="dimmed">
                                    {t('userAttributesPanel.table.userCount', {
                                        count: attribute.users.length,
                                    })}
                                </Text>
                                {isGroupManagementEnabled && (
                                    <Text fz="xs" c="dimmed">
                                        {t(
                                            'userAttributesPanel.table.groupCount',
                                            {
                                                count: attribute.groups.length,
                                            },
                                        )}
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
                            <Menu position="bottom-end">
                                <Menu.Target>
                                    <ActionIcon variant="transparent" size="sm">
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
                                        {t('actions.edit', { ns: 'common' })}
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
                                        {t('actions.delete', {
                                            ns: 'common',
                                        })}
                                    </Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                        </Box>
                    );
                },
            },
        ],
        [isGroupManagementEnabled, t],
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

    const table = useContentTable({
        columns,
        data: tableData,
        enableColumnResizing: false,
        enablePagination: false,
        enableSorting: false,
        enableTopToolbar: true,
        enableBottomToolbar: false,
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
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
            />
        ),
        renderEmptyRowsFallback: () =>
            searchQuery.trim() ? (
                <Text fz="sm" c="dimmed" ta="center" py="xl">
                    {t('userAttributesPanel.table.noSearchResults')}
                </Text>
            ) : (
                <Text fz="sm" c="dimmed" ta="center" py="xl">
                    <Trans
                        t={t}
                        i18nKey="userAttributesPanel.table.empty"
                        components={{
                            br: <br />,
                            docsLink: (
                                <Anchor
                                    href="https://docs.lightdash.com/references/user-attributes"
                                    target="_blank"
                                    rel="noreferrer"
                                    fz="sm"
                                    fw="bold"
                                />
                            ),
                        }}
                    />
                </Text>
            ),
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

    if (!user.data) return null;

    return (
        <SettingsPage
            title={
                isGroupManagementEnabled
                    ? t('userAttributesPanel.title.userAndGroupAttributes')
                    : t('userAttributesPanel.title.userAttributes')
            }
            description={t('userAttributesPanel.description')}
            actions={
                <SettingsPageActions>
                    <SettingsPageDocumentationLink href="https://docs.lightdash.com/references/user-attributes" />
                    <Button
                        size="xs"
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={addAttributeModal.open}
                    >
                        {t('userAttributesPanel.addAttribute')}
                    </Button>
                </SettingsPageActions>
            }
        >
            <ContentTable table={table} />

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
                    title={t('userAttributesPanel.deleteModal.title')}
                    variant="delete"
                    resourceType={t(
                        'userAttributesPanel.deleteModal.resourceType',
                    )}
                    resourceLabel={deleteAttribute.name}
                    onConfirm={() => {
                        deleteUserAttribute(deleteAttribute.uuid);
                        setDeleteAttribute(undefined);
                    }}
                />
            )}
        </SettingsPage>
    );
};

export default UserAttributesPanel;
