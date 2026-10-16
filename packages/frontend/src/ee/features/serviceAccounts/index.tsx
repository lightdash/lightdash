import { Button } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus, IconUsersGroup } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../components/common/MantineIcon';
import { SettingsEmptyState } from '../../../components/common/Settings/SettingsEmptyState';
import { SettingsPage } from '../../../components/common/Settings/SettingsPage';
import { ServiceAccountsCreateModal } from './ServiceAccountsCreateModal';
import { ServiceAccountsTable } from './ServiceAccountsTable';
import { useServiceAccounts } from './useServiceAccounts';

export function ServiceAccountsPage() {
    const { t } = useTranslation('serviceAccounts');
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
    // Subsequent refetches keep the existing rows visible (and ContentTable's
    // loading state will dim them via state.isLoading inside the table) so
    // the page doesn't flash on every revalidation.
    const isInitialLoading = listAccounts.isLoading && !accountsData;
    const hasAccounts = (accountsData?.length ?? 0) > 0;

    // The table owns filtered empty states; this page-level state is only for
    // organizations that have not created a service account yet.
    return (
        <SettingsPage
            title={t('page.title')}
            description={t('page.description')}
            actions={
                <Button
                    size="xs"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    onClick={open}
                >
                    {t('page.add')}
                </Button>
            }
        >
            {!isInitialLoading && !hasAccounts ? (
                <SettingsEmptyState
                    icon={IconUsersGroup}
                    title={t('page.emptyTitle')}
                    description={t('page.emptyDescription')}
                />
            ) : (
                <ServiceAccountsTable
                    accounts={accountsData ?? []}
                    isLoading={isInitialLoading}
                    onDelete={deleteAccount.mutate}
                    isDeleting={deleteAccount.isLoading}
                />
            )}

            <ServiceAccountsCreateModal
                isOpen={opened}
                onClose={handleCloseModal}
                onSave={handleSaveAccount}
                isWorking={createAccount.isLoading}
                token={token}
            />
        </SettingsPage>
    );
}
