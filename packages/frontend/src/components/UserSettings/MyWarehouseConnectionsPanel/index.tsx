import { type UserWarehouseCredentials } from '@lightdash/common';
import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { IconDatabaseCog, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useUserWarehouseCredentials } from '../../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import { EmptyState } from '../../common/EmptyState';
import MantineIcon from '../../common/MantineIcon';
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

    return (
        <>
            <Stack mb="lg">
                {credentials && credentials.length > 0 ? (
                    <>
                        <Group position="apart">
                            <Stack spacing="one">
                                <Title order={5}>
                                    My Warehouse connections
                                </Title>
                                <Text c="gray.6" fz="xs">
                                    Add credentials to connect to your
                                    warehouse.
                                </Text>
                            </Stack>
                            <Button
                                size="xs"
                                leftIcon={<MantineIcon icon={IconPlus} />}
                                onClick={() => setIsCreatingCredentials(true)}
                            >
                                Add new credentials
                            </Button>
                        </Group>
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
                    <EmptyState
                        icon={
                            <MantineIcon
                                icon={IconDatabaseCog}
                                color="gray.6"
                                stroke={1}
                                size="5xl"
                            />
                        }
                        title="No credentials"
                        description="You haven't created any personal warehouse connections yet!"
                    >
                        <Button onClick={() => setIsCreatingCredentials(true)}>
                            Add new credentials
                        </Button>
                    </EmptyState>
                )}
            </Stack>

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
        </>
    );
};
