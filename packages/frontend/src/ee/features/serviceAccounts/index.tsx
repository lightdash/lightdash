import { Button, Group, Stack, Title } from '@mantine-8/core';
import { useDisclosure } from '@mantine/hooks';
import { IconUsersGroup } from '@tabler/icons-react';
import { useState } from 'react';
import { EmptyState } from '../../../components/common/EmptyState';
import MantineIcon from '../../../components/common/MantineIcon';
import { ServiceAccountsCreateModal } from './ServiceAccountsCreateModal';
import { ServiceAccountsTable } from './ServiceAccountsTable';
import { useServiceAccounts } from './useServiceAccounts';

export function ServiceAccountsPage() {
    const [opened, { open, close }] = useDisclosure(false);
    const { listAccounts, createAccount, deleteAccount } = useServiceAccounts();
    const [token, setToken] = useState<string>();

    const handleCloseModal = () => {
        setToken(undefined);
        close();
    };

    const handleSaveAccount = async (values: any) => {
        const data = await createAccount.mutateAsync(values);
        setToken(data.token);
    };

    const accountsData = listAccounts?.data;
    // First-load vs background refetch: only block UI on the first fetch.
    // Subsequent refetches keep the existing rows visible (and MRT's own
    // loading state will dim them via state.isLoading inside the table) so
    // the page doesn't flash on every revalidation.
    const isInitialLoading = listAccounts.isLoading && !accountsData;
    const hasAccounts = (accountsData?.length ?? 0) > 0;

    // Truly-empty path keeps the friendly EmptyState with the Create CTA;
    // the table's own renderEmptyRowsFallback handles "filters returned 0"
    // separately so the toolbar stays visible while filters are applied.
    if (!isInitialLoading && !hasAccounts) {
        return (
            <Stack mb="lg">
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

    return (
        <Stack mb="lg">
            <Group justify="space-between">
                <Title order={5}>Service accounts</Title>
                <Button onClick={open} size="xs">
                    Add service account
                </Button>
            </Group>

            <ServiceAccountsTable
                accounts={accountsData ?? []}
                isLoading={isInitialLoading}
                onDelete={deleteAccount.mutate}
                isDeleting={deleteAccount.isLoading}
            />

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
