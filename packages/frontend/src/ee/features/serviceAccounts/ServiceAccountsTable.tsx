import {
    formatDate,
    formatTimestamp,
    ServiceAccountScope,
    type RoleWithScopes,
    type ServiceAccount,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Group,
    HoverCard,
    Menu,
    Stack,
    Table,
    Text,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconDots,
    IconInfoCircle,
    IconKey,
    IconTrash,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import { useCustomRoles } from '../customRoles/useCustomRoles';
import { ServiceAccountPermissionsModal } from './ServiceAccountPermissionsModal';
import { ServiceAccountsDeleteModal } from './ServiceAccountsDeleteModal';
import { isServiceAccountStale, STALE_THRESHOLD_DAYS } from './staleness';

// Display labels for the SA scope vocabulary. Both the new system-role
// aliases and the legacy `org:*` shorthands map to a single human-readable
// role name (per the codebase convention that "role" is the named bundle
// the SA is bound to; "scope" is an individual permission inside it).
const SCOPE_LABEL: Partial<Record<ServiceAccountScope, string>> = {
    [ServiceAccountScope.SYSTEM_ADMIN]: 'Admin',
    [ServiceAccountScope.SYSTEM_DEVELOPER]: 'Developer',
    [ServiceAccountScope.SYSTEM_EDITOR]: 'Editor',
    [ServiceAccountScope.SYSTEM_INTERACTIVE_VIEWER]: 'Interactive viewer',
    [ServiceAccountScope.SYSTEM_VIEWER]: 'Viewer',
    [ServiceAccountScope.ORG_ADMIN]: 'Admin',
    [ServiceAccountScope.ORG_EDIT]: 'Editor',
    [ServiceAccountScope.ORG_READ]: 'Viewer',
    [ServiceAccountScope.SCIM_MANAGE]: 'SCIM',
};

const TableRow: FC<{
    onClickDelete: (serviceAccount: ServiceAccount) => void;
    onClickInfo: (serviceAccount: ServiceAccount) => void;
    serviceAccount: ServiceAccount;
    rolesByUuid: Map<string, RoleWithScopes>;
}> = ({ onClickDelete, onClickInfo, serviceAccount, rolesByUuid }) => {
    const { description, scopes, roleUuid, lastUsedAt, rotatedAt, expiresAt } =
        serviceAccount;
    const stale = isServiceAccountStale(serviceAccount);

    // Role-driven SAs render the role name as a single badge; scope-driven
    // SAs render their scope list. The two paths are mutually exclusive
    // (validated server-side) so we don't show both.
    const role = roleUuid ? rolesByUuid.get(roleUuid) : undefined;
    const scopeBadges = scopes.map((scope) => (
        <Badge
            key={scope}
            variant="filled"
            color="ldGray.2"
            radius="xs"
            sx={{ textTransform: 'none' }}
            px="xxs"
        >
            <Text fz="xs" fw={400} color="ldGray.8">
                {SCOPE_LABEL[scope] ?? scope}
            </Text>
        </Badge>
    ));

    return (
        <tr>
            <td>
                <Group spacing="xs" noWrap>
                    <Text>{description}</Text>
                    {stale && (
                        <Tooltip
                            withinPortal
                            position="top"
                            label={`Not used in the last ${STALE_THRESHOLD_DAYS} days`}
                        >
                            <Badge
                                variant="light"
                                color="red"
                                radius="md"
                                sx={{ textTransform: 'none' }}
                                px="xxs"
                            >
                                Stale
                            </Badge>
                        </Tooltip>
                    )}
                </Group>
            </td>
            <td style={{ whiteSpace: 'nowrap' }}>
                {roleUuid ? (
                    <Badge
                        variant="filled"
                        color="indigo.1"
                        radius="xs"
                        sx={{ textTransform: 'none' }}
                        px="xxs"
                    >
                        <Text fz="xs" fw={500} color="indigo.9">
                            {role?.name ?? 'Custom role'}
                        </Text>
                    </Badge>
                ) : scopes.length > 2 ? (
                    <HoverCard offset={-20}>
                        <HoverCard.Target>
                            <Group>{`${scopes.length} permissions`}</Group>
                        </HoverCard.Target>
                        <HoverCard.Dropdown>
                            <Stack>
                                <Text fw="700">Permissions</Text>
                                {scopeBadges}
                            </Stack>
                        </HoverCard.Dropdown>
                    </HoverCard>
                ) : (
                    <Group spacing="xs">{scopeBadges}</Group>
                )}
            </td>
            <td style={{ whiteSpace: 'nowrap' }}>
                <Group align="center" position="left" spacing="xs">
                    {expiresAt ? formatDate(expiresAt) : 'No expiration date'}
                    {rotatedAt && (
                        <Tooltip
                            withinPortal
                            position="top"
                            maw={350}
                            label={`Last rotated at ${formatTimestamp(
                                rotatedAt,
                            )}`}
                        >
                            <MantineIcon
                                icon={IconInfoCircle}
                                color="ldGray.6"
                                size="md"
                            />
                        </Tooltip>
                    )}
                </Group>
            </td>
            <td style={{ whiteSpace: 'nowrap' }}>
                {lastUsedAt && (
                    <Tooltip
                        withinPortal
                        position="top"
                        maw={350}
                        label={formatTimestamp(lastUsedAt)}
                    >
                        <Text>{formatDate(lastUsedAt)}</Text>
                    </Tooltip>
                )}
            </td>
            <td width="1%">
                <Menu position="bottom-end" withinPortal>
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
                            icon={<MantineIcon icon={IconKey} />}
                            onClick={() => onClickInfo(serviceAccount)}
                        >
                            Permissions
                        </Menu.Item>
                        <Menu.Item
                            icon={<MantineIcon icon={IconTrash} />}
                            color="red"
                            onClick={() => onClickDelete(serviceAccount)}
                        >
                            Delete
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            </td>
        </tr>
    );
};

type TableProps = {
    accounts: ServiceAccount[];
    onDelete: (uuid: string) => void;
    isDeleting: boolean;
};

export const ServiceAccountsTable: FC<TableProps> = ({
    accounts,
    onDelete,
    isDeleting,
}) => {
    const { cx, classes } = useTableStyles();
    const [opened, { open, close }] = useDisclosure(false);
    const [
        permissionsOpened,
        { open: openPermissions, close: closePermissions },
    ] = useDisclosure(false);

    const { listRoles } = useCustomRoles();
    // Map roleUuid → role so each row can resolve the badge label without a
    // per-row request. `listRoles` is already used by the create modal so the
    // query is cached.
    const rolesByUuid = useMemo(() => {
        const map = new Map<string, RoleWithScopes>();
        (listRoles.data ?? []).forEach((r) => map.set(r.roleUuid, r));
        return map;
    }, [listRoles.data]);

    const [serviceAccountToDelete, setServiceAccountToDelete] = useState<
        ServiceAccount | undefined
    >();
    const [serviceAccountToView, setServiceAccountToView] = useState<
        ServiceAccount | undefined
    >();

    const handleDelete = async () => {
        onDelete(serviceAccountToDelete?.uuid ?? '');
        setServiceAccountToDelete(undefined);
        close();
    };

    const handleOpenModal = (serviceAccount: ServiceAccount) => {
        setServiceAccountToDelete(serviceAccount);
        open();
    };

    const handleCloseModal = () => {
        setServiceAccountToDelete(undefined);
        close();
    };

    const handleOpenPermissions = (serviceAccount: ServiceAccount) => {
        setServiceAccountToView(serviceAccount);
        openPermissions();
    };

    const handleClosePermissions = () => {
        setServiceAccountToView(undefined);
        closePermissions();
    };

    return (
        <>
            <Table className={cx(classes.root, classes.alignLastTdRight)}>
                <thead>
                    <tr>
                        <th>Description</th>
                        <th style={{ whiteSpace: 'nowrap', width: '1%' }}>
                            Role
                        </th>
                        <th style={{ whiteSpace: 'nowrap', width: '1%' }}>
                            Expires at
                        </th>
                        <th style={{ whiteSpace: 'nowrap', width: '1%' }}>
                            Last used at
                        </th>
                        <th style={{ width: '1%' }}></th>
                    </tr>
                </thead>
                <tbody>
                    {accounts.map((serviceAccount) => (
                        <TableRow
                            key={serviceAccount.uuid}
                            serviceAccount={serviceAccount}
                            onClickDelete={handleOpenModal}
                            onClickInfo={handleOpenPermissions}
                            rolesByUuid={rolesByUuid}
                        />
                    ))}
                </tbody>
            </Table>

            <ServiceAccountsDeleteModal
                isOpen={opened}
                onClose={handleCloseModal}
                isDeleting={isDeleting}
                onDelete={handleDelete}
                serviceAccount={serviceAccountToDelete!}
            />

            <ServiceAccountPermissionsModal
                isOpen={permissionsOpened}
                onClose={handleClosePermissions}
                serviceAccount={serviceAccountToView}
            />
        </>
    );
};
