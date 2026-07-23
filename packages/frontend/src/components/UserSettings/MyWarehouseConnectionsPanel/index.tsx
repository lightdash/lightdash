import { type UserWarehouseCredentials } from '@lightdash/common';
import { Anchor, Button, Text } from '@mantine-8/core';
import { IconDatabaseCog, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useUserWarehouseCredentials } from '../../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import MantineIcon from '../../common/MantineIcon';
import { SettingsEmptyState } from '../../common/Settings/SettingsEmptyState';
import { SettingsPage } from '../../common/Settings/SettingsPage';
import { CreateCredentialsModal } from './CreateCredentialsModal';
import { CredentialsTable } from './CredentialsTable';
import { DeleteCredentialsModal } from './DeleteCredentialsModal';
import { EditCredentialsModal } from './EditCredentialsModal';

export const MyWarehouseConnectionsPanel = () => {
    const { data: credentials } = useUserWarehouseCredentials();
    const [isCreatingCredentials, setIsCreatingCredentials] = useState(false);
    const [warehouseCredentialsToBeEdited, setWarehouseCredentialsToBeEdited] =
        useState<UserWarehouseCredentials | undefined>(undefined);
    const [
        warehouseCredentialsToBeDeleted,
        setWarehouseCredentialsToBeDeleted,
    ] = useState<UserWarehouseCredentials | undefined>(undefined);

    const personalConnectionsCallout = (
        <Text c="dimmed" fz="xs">
            These credentials are only used for projects that require user
            credentials -{' '}
            <Anchor
                role="button"
                href="https://docs.lightdash.com/references/personal-warehouse-connections"
                target="_blank"
                rel="noreferrer"
                fz="xs"
            >
                learn more
            </Anchor>
            .
        </Text>
    );

    return (
        <SettingsPage
            title="My warehouse connections"
            description="Manage the personal credentials used to connect Lightdash to warehouses."
            actions={
                <Button
                    size="xs"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    onClick={() => setIsCreatingCredentials(true)}
                >
                    Add credentials
                </Button>
            }
        >
            {credentials && credentials.length > 0 ? (
                <>
                    {personalConnectionsCallout}
                    <CredentialsTable
                        credentials={credentials}
                        setWarehouseCredentialsToBeDeleted={
                            setWarehouseCredentialsToBeDeleted
                        }
                        setWarehouseCredentialsToBeEdited={
                            setWarehouseCredentialsToBeEdited
                        }
                    />
                </>
            ) : (
                <SettingsEmptyState
                    icon={IconDatabaseCog}
                    title="No warehouse connections"
                    description="Add personal credentials for projects that require them."
                >
                    {personalConnectionsCallout}
                </SettingsEmptyState>
            )}

            {!!warehouseCredentialsToBeEdited && (
                <EditCredentialsModal
                    opened={!!warehouseCredentialsToBeEdited}
                    onClose={() => setWarehouseCredentialsToBeEdited(undefined)}
                    userCredentials={warehouseCredentialsToBeEdited}
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
