import { type OrganizationWarehouseCredentials } from '@lightdash/common';
import {
    Button,
    Group,
    LoadingOverlay,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconDatabaseCog, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useOrganizationWarehouseCredentials } from '../../../hooks/organization/useOrganizationWarehouseCredentials';
import { EmptyState } from '../../common/EmptyState';
import MantineIcon from '../../common/MantineIcon';
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
        return <LoadingOverlay visible={isLoading} />;
    }
    return (
        <>
            <Stack mb="lg">
                {credentials && credentials.length > 0 ? (
                    <>
                        <Group position="apart">
                            <Stack spacing="one">
                                <Title order={5}>
                                    Organization warehouse credentials
                                </Title>
                                <Text c="ldGray.6" fz="xs">
                                    Shared credentials that can be used across
                                    all projects in your organization.
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
                                color="ldGray.6"
                                stroke={1}
                                size="5xl"
                            />
                        }
                        title="No credentials"
                        description="You haven't created any organization warehouse credentials yet!"
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
        </>
    );
};
