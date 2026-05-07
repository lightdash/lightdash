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
    Box,
    Button,
    Center,
    Checkbox,
    Divider,
    Group,
    HoverCard,
    Menu,
    Popover,
    ScrollArea,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
    Tooltip,
    useMantineTheme,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconCalendar,
    IconClock,
    IconDots,
    IconFilter,
    IconInfoCircle,
    IconRefresh,
    IconSearch,
    IconShieldLock,
    IconTextCaption,
    IconTrash,
    IconUser,
    IconX,
} from '@tabler/icons-react';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
} from 'mantine-react-table';
import { useCallback, useMemo, useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { useCustomRoles } from '../customRoles/useCustomRoles';
import { ServiceAccountsDeleteModal } from './ServiceAccountsDeleteModal';
import { ServiceAccountsRotateModal } from './ServiceAccountsRotateModal';
import classes from './ServiceAccountsToolbar.module.css';
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

// Status filter mirrors the original toolbar — Active = used in the last
// 30 days; Stale = not used or never used. Sliding window is governed by
// `STALE_THRESHOLD_DAYS` so the badge in the row stays in lockstep.
type StatusFilter = 'all' | 'active' | 'stale';

const STATUS_FILTER_OPTIONS: {
    value: StatusFilter;
    label: string;
    tooltip: string;
}[] = [
    { value: 'all', label: 'All', tooltip: 'Show all service accounts' },
    {
        value: 'active',
        label: 'Active',
        tooltip: `Show accounts used in the last ${STALE_THRESHOLD_DAYS} days`,
    },
    {
        value: 'stale',
        label: 'Stale',
        tooltip: `Show accounts not used in the last ${STALE_THRESHOLD_DAYS} days`,
    },
];

const formatCreatedBy = (sa: ServiceAccount): string => {
    if (!sa.createdBy) return '';
    return `${sa.createdBy.firstName} ${sa.createdBy.lastName}`.trim();
};

// Resolve the role label for a row so sort-by-role groups SAs that render
// the same badge together (rather than sorting on raw scope strings).
// MRT briefly invokes accessorFn with placeholder rows during auto-sort
// inference, so guard against `scopes` being undefined.
const formatRoleLabel = (
    sa: ServiceAccount,
    rolesByUuid: Map<string, RoleWithScopes>,
): string => {
    if (sa.roleUuid) {
        return rolesByUuid.get(sa.roleUuid)?.name ?? 'Custom role';
    }
    const scopes = sa.scopes ?? [];
    if (scopes.length === 1) {
        return SCOPE_LABEL[scopes[0]] ?? scopes[0];
    }
    if (scopes.length === 0) return '';
    return `${scopes.length} permissions`;
};

type Props = {
    accounts: ServiceAccount[];
    isLoading: boolean;
    onDelete: (uuid: string) => void;
    isDeleting: boolean;
};

export const ServiceAccountsTable: FC<Props> = ({
    accounts,
    isLoading,
    onDelete,
    isDeleting,
}) => {
    const theme = useMantineTheme();
    const [opened, { open, close }] = useDisclosure(false);
    const [rotateOpened, { open: openRotate, close: closeRotate }] =
        useDisclosure(false);

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [selectedCreators, setSelectedCreators] = useState<string[]>([]);

    const { listRoles } = useCustomRoles();
    // Map roleUuid → role so each row can resolve the badge label without a
    // per-row request. `listRoles` is already used by the create modal so
    // the query is cached.
    const rolesByUuid = useMemo(() => {
        const map = new Map<string, RoleWithScopes>();
        (listRoles.data ?? []).forEach((r) => map.set(r.roleUuid, r));
        return map;
    }, [listRoles.data]);

    // Derive the unique creator list from the data so the popover shows
    // exactly the people who've actually minted SAs in this org — keeps
    // the filter relevant even on orgs with hundreds of users.
    const availableCreators = useMemo(() => {
        const map = new Map<string, string>();
        accounts.forEach((sa) => {
            if (sa.createdBy) {
                map.set(
                    sa.createdBy.userUuid,
                    formatCreatedBy(sa) || sa.createdBy.userUuid,
                );
            }
        });
        return Array.from(map.entries()).map(([uuid, name]) => ({
            uuid,
            name,
        }));
    }, [accounts]);

    const filteredAccounts = useMemo(() => {
        const trimmedSearch = search.trim().toLowerCase();
        return accounts.filter((sa) => {
            const matchesSearch =
                !trimmedSearch ||
                sa.description.toLowerCase().includes(trimmedSearch);
            const matchesStatus =
                statusFilter === 'all' ||
                (statusFilter === 'stale'
                    ? isServiceAccountStale(sa)
                    : !isServiceAccountStale(sa));
            const matchesCreator =
                selectedCreators.length === 0 ||
                (sa.createdBy &&
                    selectedCreators.includes(sa.createdBy.userUuid));
            return matchesSearch && matchesStatus && matchesCreator;
        });
    }, [accounts, search, statusFilter, selectedCreators]);

    const [serviceAccountToDelete, setServiceAccountToDelete] = useState<
        ServiceAccount | undefined
    >();
    const [serviceAccountToRotate, setServiceAccountToRotate] = useState<
        ServiceAccount | undefined
    >();

    const handleOpenDelete = useCallback(
        (sa: ServiceAccount) => {
            setServiceAccountToDelete(sa);
            open();
        },
        [open],
    );

    const handleCloseDelete = useCallback(() => {
        setServiceAccountToDelete(undefined);
        close();
    }, [close]);

    const handleConfirmDelete = useCallback(() => {
        onDelete(serviceAccountToDelete?.uuid ?? '');
        setServiceAccountToDelete(undefined);
        close();
    }, [onDelete, serviceAccountToDelete, close]);

    const handleOpenRotate = useCallback(
        (sa: ServiceAccount) => {
            setServiceAccountToRotate(sa);
            openRotate();
        },
        [openRotate],
    );

    const handleCloseRotate = useCallback(() => {
        setServiceAccountToRotate(undefined);
        closeRotate();
    }, [closeRotate]);

    const columns: MRT_ColumnDef<ServiceAccount>[] = useMemo(
        () => [
            {
                accessorKey: 'description',
                header: 'Description',
                enableSorting: true,
                size: 240,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconTextCaption} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const sa = row.original;
                    const stale = isServiceAccountStale(sa);
                    return (
                        <Group gap="xs" wrap="nowrap">
                            <Text fz="sm" fw={500} truncate="end">
                                {sa.description}
                            </Text>
                            {stale && (
                                <Tooltip
                                    withinPortal
                                    position="top"
                                    label={`Not used in the last ${STALE_THRESHOLD_DAYS} days`}
                                >
                                    <Badge
                                        variant="light"
                                        color="red"
                                        size="xs"
                                        radius="md"
                                        style={{ textTransform: 'none' }}
                                    >
                                        Stale
                                    </Badge>
                                </Tooltip>
                            )}
                        </Group>
                    );
                },
            },
            {
                id: 'role',
                header: 'Role',
                enableSorting: true,
                accessorFn: (sa) => formatRoleLabel(sa, rolesByUuid),
                size: 160,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconShieldLock} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const sa = row.original;
                    const scopes = sa.scopes ?? [];
                    const role = sa.roleUuid
                        ? rolesByUuid.get(sa.roleUuid)
                        : undefined;
                    if (sa.roleUuid) {
                        // `variant="light"` lets Mantine pick the right
                        // tone for light/dark mode automatically. The hard-
                        // coded `indigo.1` / `indigo.9` we had before
                        // didn't invert and looked washed-out on dark.
                        return (
                            <Badge
                                variant="light"
                                color="indigo"
                                radius="xs"
                                size="sm"
                                style={{ textTransform: 'none' }}
                            >
                                {role?.name ?? 'Custom role'}
                            </Badge>
                        );
                    }
                    if (scopes.length > 2) {
                        return (
                            <HoverCard offset={-20} withinPortal>
                                <HoverCard.Target>
                                    <Group>
                                        <Text fz="sm">
                                            {`${scopes.length} permissions`}
                                        </Text>
                                    </Group>
                                </HoverCard.Target>
                                <HoverCard.Dropdown>
                                    <Stack>
                                        <Text fw={700}>Permissions</Text>
                                        {scopes.map((scope) => (
                                            <Badge
                                                key={scope}
                                                variant="light"
                                                color="gray"
                                                radius="xs"
                                                size="sm"
                                                style={{
                                                    textTransform: 'none',
                                                }}
                                            >
                                                {SCOPE_LABEL[scope] ?? scope}
                                            </Badge>
                                        ))}
                                    </Stack>
                                </HoverCard.Dropdown>
                            </HoverCard>
                        );
                    }
                    return (
                        <Group gap="xs">
                            {scopes.map((scope) => (
                                <Badge
                                    key={scope}
                                    variant="light"
                                    color="gray"
                                    radius="xs"
                                    size="sm"
                                    style={{ textTransform: 'none' }}
                                >
                                    {SCOPE_LABEL[scope] ?? scope}
                                </Badge>
                            ))}
                        </Group>
                    );
                },
            },
            {
                id: 'createdBy',
                header: 'Created by',
                enableSorting: true,
                accessorFn: (sa) => formatCreatedBy(sa),
                size: 150,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconUser} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const label = formatCreatedBy(row.original);
                    return (
                        <Text fz="sm" c={label ? 'ldGray.7' : 'ldGray.5'}>
                            {label || '—'}
                        </Text>
                    );
                },
            },
            {
                accessorKey: 'createdAt',
                header: 'Created',
                enableSorting: true,
                size: 120,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconClock} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Tooltip
                        withinPortal
                        position="top"
                        label={formatTimestamp(row.original.createdAt)}
                    >
                        <Text fz="sm" c="ldGray.7">
                            {formatDate(row.original.createdAt)}
                        </Text>
                    </Tooltip>
                ),
            },
            {
                accessorKey: 'expiresAt',
                header: 'Expires at',
                enableSorting: true,
                size: 140,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconCalendar} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                // Coerce to a sortable number; null = no-expiration so we
                // float those rows to the end (Infinity) regardless of
                // sort direction. MRT will respect the asc/desc factor.
                sortingFn: (a, b) => {
                    const av = a.original.expiresAt
                        ? +new Date(a.original.expiresAt)
                        : Number.POSITIVE_INFINITY;
                    const bv = b.original.expiresAt
                        ? +new Date(b.original.expiresAt)
                        : Number.POSITIVE_INFINITY;
                    return av - bv;
                },
                Cell: ({ row }) => {
                    const { expiresAt, rotatedAt } = row.original;
                    return (
                        <Group align="center" gap="xs" wrap="nowrap">
                            <Text fz="sm" c="ldGray.7">
                                {expiresAt
                                    ? formatDate(expiresAt)
                                    : 'No expiration'}
                            </Text>
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
                    );
                },
            },
            {
                accessorKey: 'lastUsedAt',
                header: 'Last used at',
                enableSorting: true,
                size: 140,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconClock} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                // Same null-handling rule as expiresAt: never-used SAs
                // float to the end so they don't dominate the top of an
                // ascending sort.
                sortingFn: (a, b) => {
                    const av = a.original.lastUsedAt
                        ? +new Date(a.original.lastUsedAt)
                        : Number.POSITIVE_INFINITY;
                    const bv = b.original.lastUsedAt
                        ? +new Date(b.original.lastUsedAt)
                        : Number.POSITIVE_INFINITY;
                    return av - bv;
                },
                Cell: ({ row }) => {
                    const lastUsedAt = row.original.lastUsedAt;
                    if (!lastUsedAt) {
                        return (
                            <Text fz="sm" c="ldGray.5">
                                Never
                            </Text>
                        );
                    }
                    return (
                        <Tooltip
                            withinPortal
                            position="top"
                            label={formatTimestamp(lastUsedAt)}
                        >
                            <Text fz="sm" c="ldGray.7">
                                {formatDate(lastUsedAt)}
                            </Text>
                        </Tooltip>
                    );
                },
            },
            {
                id: 'actions',
                header: '',
                enableSorting: false,
                size: 60,
                mantineTableHeadCellProps: { align: 'right' },
                mantineTableBodyCellProps: { align: 'right' },
                Cell: ({ row }) => {
                    const sa = row.original;
                    return (
                        <Menu
                            withinPortal
                            position="bottom-end"
                            withArrow
                            arrowPosition="center"
                            shadow="md"
                        >
                            <Menu.Target>
                                <ActionIcon variant="subtle" color="gray">
                                    <MantineIcon icon={IconDots} />
                                </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                                {sa.roleUuid && (
                                    <Menu.Item
                                        component={Link}
                                        to={`/generalSettings/customRoles/${sa.roleUuid}`}
                                        leftSection={
                                            <MantineIcon
                                                icon={IconShieldLock}
                                            />
                                        }
                                    >
                                        View custom role
                                    </Menu.Item>
                                )}
                                {sa.expiresAt && (
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon icon={IconRefresh} />
                                        }
                                        onClick={() => handleOpenRotate(sa)}
                                    >
                                        Rotate token
                                    </Menu.Item>
                                )}
                                {(sa.roleUuid || sa.expiresAt) && (
                                    <Menu.Divider />
                                )}
                                <Menu.Item
                                    color="red"
                                    leftSection={
                                        <MantineIcon icon={IconTrash} />
                                    }
                                    onClick={() => handleOpenDelete(sa)}
                                >
                                    Delete
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    );
                },
            },
        ],
        [rolesByUuid, handleOpenRotate, handleOpenDelete],
    );

    const handleStatusFilterChange = useCallback((value: string) => {
        setStatusFilter(value as StatusFilter);
    }, []);

    const hasActiveFilters =
        selectedCreators.length > 0 ||
        statusFilter !== 'all' ||
        search.length > 0;

    const table = useMantineReactTable({
        columns,
        data: filteredAccounts,
        enableColumnActions: false,
        enableColumnFilters: false,
        enablePagination: false,
        enableSorting: true,
        enableTopToolbar: true,
        enableBottomToolbar: false,
        enableGlobalFilter: false,
        mantinePaperProps: {
            shadow: undefined,
            style: {
                border: `1px solid ${theme.colors.ldGray[2]}`,
                borderRadius: theme.radius.md,
                boxShadow: theme.shadows.subtle,
                display: 'flex',
                flexDirection: 'column' as const,
                overflow: 'hidden',
            },
        },
        mantineTableHeadRowProps: { sx: { boxShadow: 'none' } },
        mantineTableHeadCellProps: {
            bg: 'ldGray.0',
            style: {
                userSelect: 'none',
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                borderTop: `1px solid ${theme.colors.ldGray[2]}`,
                borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
            },
        },
        mantineTableBodyCellProps: {
            style: {
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                borderTop: 'none',
            },
        },
        mantineTableProps: { highlightOnHover: true },
        state: { isLoading },
        renderEmptyRowsFallback: () => (
            <Center className={classes.emptyState}>
                <MantineIcon
                    icon={search ? IconSearch : IconFilter}
                    size="xl"
                    color="ldGray.4"
                    className={classes.emptyStateIcon}
                />
                <Text fz="sm" fw={500} c="ldGray.6">
                    {search
                        ? `No service accounts matching "${search}"`
                        : 'No service accounts match the current filters'}
                </Text>
                {hasActiveFilters && (
                    <Button
                        variant="subtle"
                        size="xs"
                        onClick={() => {
                            setSearch('');
                            setStatusFilter('all');
                            setSelectedCreators([]);
                        }}
                    >
                        Clear all filters
                    </Button>
                )}
            </Center>
        ),
        renderTopToolbar: () => (
            <Group
                justify="space-between"
                p={`${theme.spacing.sm} ${theme.spacing.md}`}
                wrap="nowrap"
                className={classes.toolbar}
            >
                <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    <Tooltip
                        withinPortal
                        variant="xs"
                        label="Search by description"
                    >
                        <TextInput
                            size="xs"
                            radius="md"
                            type="search"
                            variant="default"
                            placeholder="Search service accounts..."
                            value={search}
                            classNames={{
                                input: search
                                    ? classes.searchInputWithValue
                                    : classes.searchInput,
                            }}
                            leftSection={
                                <MantineIcon
                                    size="md"
                                    color="ldGray.6"
                                    icon={IconSearch}
                                />
                            }
                            onChange={(e) => setSearch(e.target.value)}
                            rightSection={
                                search ? (
                                    <ActionIcon
                                        onClick={() => setSearch('')}
                                        variant="transparent"
                                        size="xs"
                                        color="ldGray.5"
                                    >
                                        <MantineIcon icon={IconX} />
                                    </ActionIcon>
                                ) : null
                            }
                        />
                    </Tooltip>

                    <Divider
                        orientation="vertical"
                        w={1}
                        h={20}
                        style={{ alignSelf: 'center' }}
                    />

                    <SegmentedControl
                        size="xs"
                        radius="md"
                        value={statusFilter}
                        onChange={handleStatusFilterChange}
                        classNames={{
                            root: classes.segmentedControl,
                            indicator: classes.segmentedIndicator,
                            label: classes.segmentedLabel,
                        }}
                        data={STATUS_FILTER_OPTIONS.map((option) => ({
                            value: option.value,
                            label: (
                                <Tooltip label={option.tooltip} withinPortal>
                                    <Box>
                                        <Text fz="xs" fw={500}>
                                            {option.label}
                                        </Text>
                                    </Box>
                                </Tooltip>
                            ),
                        }))}
                    />

                    {availableCreators.length > 0 && (
                        <>
                            <Divider
                                orientation="vertical"
                                w={1}
                                h={20}
                                style={{ alignSelf: 'center' }}
                            />
                            <Popover width={250} position="bottom-start">
                                <Popover.Target>
                                    <Tooltip
                                        withinPortal
                                        variant="xs"
                                        label="Filter by creator"
                                    >
                                        <Button
                                            h={32}
                                            c="foreground"
                                            fw={500}
                                            fz="sm"
                                            variant="default"
                                            radius="md"
                                            px="sm"
                                            className={
                                                selectedCreators.length > 0
                                                    ? classes.filterButtonSelected
                                                    : classes.filterButton
                                            }
                                            classNames={{
                                                label: classes.buttonLabel,
                                            }}
                                            rightSection={
                                                selectedCreators.length > 0 ? (
                                                    <Badge
                                                        size="xs"
                                                        variant="filled"
                                                        color="indigo.6"
                                                        circle
                                                        styles={{
                                                            root: {
                                                                minWidth: 18,
                                                                height: 18,
                                                                padding:
                                                                    '0 4px',
                                                            },
                                                        }}
                                                    >
                                                        {
                                                            selectedCreators.length
                                                        }
                                                    </Badge>
                                                ) : null
                                            }
                                        >
                                            Created by
                                        </Button>
                                    </Tooltip>
                                </Popover.Target>
                                <Popover.Dropdown p="sm">
                                    <Stack gap={4}>
                                        <Text fz="xs" c="ldGray.9" fw={600}>
                                            Filter by creator:
                                        </Text>
                                        <ScrollArea.Autosize
                                            mah={200}
                                            type="always"
                                            scrollbars="y"
                                        >
                                            <Stack gap="xs">
                                                {availableCreators.map((c) => (
                                                    <Checkbox
                                                        key={c.uuid}
                                                        label={c.name}
                                                        checked={selectedCreators.includes(
                                                            c.uuid,
                                                        )}
                                                        size="xs"
                                                        classNames={{
                                                            body: classes.checkboxBody,
                                                            input: classes.checkboxInput,
                                                            label: classes.checkboxLabel,
                                                        }}
                                                        onChange={() => {
                                                            setSelectedCreators(
                                                                (prev) =>
                                                                    prev.includes(
                                                                        c.uuid,
                                                                    )
                                                                        ? prev.filter(
                                                                              (
                                                                                  x,
                                                                              ) =>
                                                                                  x !==
                                                                                  c.uuid,
                                                                          )
                                                                        : [
                                                                              ...prev,
                                                                              c.uuid,
                                                                          ],
                                                            );
                                                        }}
                                                    />
                                                ))}
                                            </Stack>
                                        </ScrollArea.Autosize>
                                    </Stack>
                                </Popover.Dropdown>
                            </Popover>
                        </>
                    )}
                </Group>

                {hasActiveFilters && (
                    <Tooltip label="Clear all filters">
                        <ActionIcon
                            variant="subtle"
                            size="sm"
                            color="gray"
                            onClick={() => {
                                setSearch('');
                                setStatusFilter('all');
                                setSelectedCreators([]);
                            }}
                        >
                            <MantineIcon icon={IconTrash} />
                        </ActionIcon>
                    </Tooltip>
                )}
            </Group>
        ),
    });

    return (
        <>
            <MantineReactTable table={table} />

            <ServiceAccountsDeleteModal
                isOpen={opened}
                onClose={handleCloseDelete}
                isDeleting={isDeleting}
                onDelete={handleConfirmDelete}
                serviceAccount={serviceAccountToDelete!}
            />

            <ServiceAccountsRotateModal
                isOpen={rotateOpened}
                onClose={handleCloseRotate}
                serviceAccount={serviceAccountToRotate}
            />
        </>
    );
};
