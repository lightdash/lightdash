import { type OrganizationWarehouseCredentials } from '@lightdash/common';
import { Box, Button, LoadingOverlay } from '@mantine-8/core';
import { IconDatabaseCog, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useOrganizationWarehouseCredentials } from '../../../hooks/organization/useOrganizationWarehouseCredentials';
import MantineIcon from '../../common/MantineIcon';
import { SettingsEmptyState } from '../../common/Settings/SettingsEmptyState';
import { SettingsPage } from '../../common/Settings/SettingsPage';
import { CreateCredentialsModal } from './CreateCredentialsModal';
import { CredentialsTable } from './CredentialsTable';
import { DeleteCredentialsModal } from './DeleteCredentialsModal';
import { EditCredentialsModal } from './EditCredentialsModal';

export const OrganizationWarehouseCredentialsPanel = () => {
    const { data: credentials, isLoading } =
        useOrganizationWarehouseCredentials();
    const [isCreatingCredentials, setIsCreatingCredentials] = useState(false);
    const [warehouseCredentialsToBeEdited, setWarehouseCredentialsToBeEdited] =
        useState<OrganizationWarehouseCredentials | undefined>(undefined);
    const [
        warehouseCredentialsToBeDeleted,
        setWarehouseCredentialsToBeDeleted,
    ] = useState<OrganizationWarehouseCredentials | undefined>(undefined);

    if (isLoading) {
        return (
            <SettingsPage
                title="Warehouse credentials"
                description="Manage shared credentials available across your organization."
            >
                <Box pos="relative" mih={120}>
                    <LoadingOverlay visible />
                </Box>
            </SettingsPage>
        );
    }
    return (
        <SettingsPage
            title="Warehouse credentials"
            description="Manage shared credentials available across your organization."
            actions={
                credentials && credentials.length > 0 ? (
                    <Button
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={() => setIsCreatingCredentials(true)}
                    >
                        Add credentials
                    </Button>
                ) : null
            }
        >
            {credentials && credentials.length > 0 ? (
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
                    title="No warehouse credentials"
                    description="Add shared credentials for projects across your organization."
                >
                    <Button onClick={() => setIsCreatingCredentials(true)}>
                        Add credentials
                    </Button>
                </SettingsEmptyState>
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
