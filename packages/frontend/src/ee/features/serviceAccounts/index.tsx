import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    Paper,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
    Title,
    Tooltip,
    useMantineTheme,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine/hooks';
import { IconSearch, IconUsersGroup, IconX } from '@tabler/icons-react';
import { useCallback, useMemo, useState } from 'react';
import { EmptyState } from '../../../components/common/EmptyState';
import MantineIcon from '../../../components/common/MantineIcon';
import { ServiceAccountsCreateModal } from './ServiceAccountsCreateModal';
import { ServiceAccountsTable } from './ServiceAccountsTable';
import classes from './ServiceAccountsToolbar.module.css';
import { isServiceAccountStale } from './staleness';
import { useServiceAccounts } from './useServiceAccounts';

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
        tooltip: 'Show accounts used in the last 30 days',
    },
    {
        value: 'stale',
        label: 'Stale',
        tooltip: 'Show accounts not used in the last 30 days',
    },
];

export function ServiceAccountsPage() {
    const theme = useMantineTheme();
    const [opened, { open, close }] = useDisclosure(false);
    const { listAccounts, createAccount, deleteAccount } = useServiceAccounts();
    const [token, setToken] = useState<string>();
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [search, setSearch] = useState('');

    const handleCloseModal = () => {
        setToken(undefined);
        close();
    };

    const handleSaveAccount = async (values: any) => {
        const data = await createAccount.mutateAsync(values);
        setToken(data.token);
    };

    const handleStatusFilterChange = useCallback((value: string) => {
        setStatusFilter(value as StatusFilter);
    }, []);

    const accountsData = listAccounts?.data;
    const hasAccounts = (accountsData?.length ?? 0) > 0;

    const filteredAccounts = useMemo(() => {
        const all = accountsData ?? [];
        const trimmedSearch = search.trim().toLowerCase();
        return all.filter((account) => {
            const matchesSearch =
                !trimmedSearch ||
                account.description.toLowerCase().includes(trimmedSearch);
            const matchesStatus =
                statusFilter === 'all' ||
                (statusFilter === 'stale'
                    ? isServiceAccountStale(account)
                    : !isServiceAccountStale(account));
            return matchesSearch && matchesStatus;
        });
    }, [accountsData, search, statusFilter]);

    return (
        <Stack mb="lg">
            {hasAccounts ? (
                <>
                    <Group justify="space-between">
                        <Title order={5}>Service accounts</Title>
                        <Button onClick={open} size="xs">
                            Add service account
                        </Button>
                    </Group>
                    <Paper
                        withBorder
                        style={{
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                    >
                        <Group
                            justify="space-between"
                            wrap="nowrap"
                            p={`${theme.spacing.sm} ${theme.spacing.md}`}
                            className={classes.toolbar}
                        >
                            <Group gap="xs" wrap="nowrap">
                                <Tooltip
                                    withinPortal
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
                                        onChange={(e) =>
                                            setSearch(e.target.value)
                                        }
                                        rightSection={
                                            search ? (
                                                <ActionIcon
                                                    onClick={() =>
                                                        setSearch('')
                                                    }
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
                                    data={STATUS_FILTER_OPTIONS.map(
                                        (option) => ({
                                            value: option.value,
                                            label: (
                                                <Tooltip
                                                    label={option.tooltip}
                                                    withinPortal
                                                >
                                                    <Box>
                                                        <Text fz="xs" fw={500}>
                                                            {option.label}
                                                        </Text>
                                                    </Box>
                                                </Tooltip>
                                            ),
                                        }),
                                    )}
                                />
                            </Group>
                        </Group>
                        <ServiceAccountsTable
                            accounts={filteredAccounts}
                            onDelete={deleteAccount.mutate}
                            isDeleting={deleteAccount.isLoading}
                        />
                    </Paper>
                </>
            ) : (
                <EmptyState
                    icon={
                        <MantineIcon
                            icon={IconUsersGroup}
                            color="ldGray.6"
                            stroke={1}
                            size="5xl"
                        />
                    }
                    title="No service accounts"
                    description="You haven't created any service accounts yet. Create your first service account"
                >
                    <Button onClick={open}>Create service account</Button>
                </EmptyState>
            )}

            <ServiceAccountsCreateModal
                isOpen={opened}
                onClose={handleCloseModal}
                onSave={handleSaveAccount}
                isWorking={createAccount.isLoading}
                token={token}
            />
        </Stack>
    );
}
