import { Button, Group, Stack, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconUsersGroup } from '@tabler/icons-react';

import { EmptyState } from '../../../components/common/EmptyState';
import MantineIcon from '../../../components/common/MantineIcon';

import { useState } from 'react';
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

    const hasAccounts = listAccounts?.data?.length ?? 0 > 0;

    return (
        <Stack mb="lg">
            {hasAccounts ? (
                <>
                    <Group position="apart">
                        <Title size="h5">Service accounts</Title>
                        <Button onClick={open} size="xs">
                            Add service account
                        </Button>
                    </Group>
                    <ServiceAccountsTable
                        accounts={listAccounts?.data ?? []}
                        onDelete={deleteAccount.mutate}
                        isDeleting={deleteAccount.isLoading}
                    />
                </>
            ) : (
                <EmptyState
                    icon={
                        <MantineIcon
                            icon={IconUsersGroup}
                            color="gray.6"
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
