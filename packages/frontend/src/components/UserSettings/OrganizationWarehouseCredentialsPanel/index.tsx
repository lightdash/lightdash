import { type OrganizationWarehouseCredentials } from '@lightdash/common';
import { Box, Button, LoadingOverlay } from '@mantine/core';
import { IconDatabaseCog, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrganizationWarehouseCredentials } from '../../../hooks/organization/useOrganizationWarehouseCredentials';
import MantineIcon from '../../common/MantineIcon';
import { SettingsEmptyState } from '../../common/Settings/SettingsEmptyState';
import { SettingsPage } from '../../common/Settings/SettingsPage';
import { CreateCredentialsModal } from './CreateCredentialsModal';
import { CredentialsTable } from './CredentialsTable';
import { DeleteCredentialsModal } from './DeleteCredentialsModal';
import { EditCredentialsModal } from './EditCredentialsModal';

export const OrganizationWarehouseCredentialsPanel = () => {
    const { t } = useTranslation('userSettings');
    const { data: credentials, isLoading } =
        useOrganizationWarehouseCredentials();
    const [isCreatingCredentials, setIsCreatingCredentials] = useState(false);
    const [warehouseCredentialsToBeEdited, setWarehouseCredentialsToBeEdited] =
        useState<OrganizationWarehouseCredentials | undefined>(undefined);
    const [
        warehouseCredentialsToBeDeleted,
        setWarehouseCredentialsToBeDeleted,
    ] = useState<OrganizationWarehouseCredentials | undefined>(undefined);

    return (
        <SettingsPage
            title={t('organizationWarehouseCredentialsPanel.page.title')}
            description={t(
                'organizationWarehouseCredentialsPanel.page.description',
            )}
            actions={
                <Button
                    size="xs"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    onClick={() => setIsCreatingCredentials(true)}
                >
                    {t(
                        'organizationWarehouseCredentialsPanel.page.addCredentials',
                    )}
                </Button>
            }
        >
            {isLoading ? (
                <Box pos="relative" mih={120}>
                    <LoadingOverlay visible />
                </Box>
            ) : credentials && credentials.length > 0 ? (
                <CredentialsTable
                    credentials={credentials}
                    setWarehouseCredentialsToBeDeleted={
                        setWarehouseCredentialsToBeDeleted
                    }
                    setWarehouseCredentialsToBeEdited={
                        setWarehouseCredentialsToBeEdited
                    }
                />
            ) : (
                <SettingsEmptyState
                    icon={IconDatabaseCog}
                    title={t(
                        'organizationWarehouseCredentialsPanel.page.emptyState.title',
                    )}
                    description={t(
                        'organizationWarehouseCredentialsPanel.page.emptyState.description',
                    )}
                />
            )}

            {!!warehouseCredentialsToBeEdited && (
                <EditCredentialsModal
                    opened={!!warehouseCredentialsToBeEdited}
                    onClose={() => setWarehouseCredentialsToBeEdited(undefined)}
                    organizationCredentials={warehouseCredentialsToBeEdited}
                />
            )}

            {isCreatingCredentials && (
                <CreateCredentialsModal
                    opened={isCreatingCredentials}
                    onClose={() => setIsCreatingCredentials(false)}
                />
            )}

            {warehouseCredentialsToBeDeleted && (
                <DeleteCredentialsModal
                    opened={!!warehouseCredentialsToBeDeleted}
                    onClose={() =>
                        setWarehouseCredentialsToBeDeleted(undefined)
                    }
                    warehouseCredentialsToBeDeleted={
                        warehouseCredentialsToBeDeleted
                    }
                />
            )}
        </SettingsPage>
    );
};
