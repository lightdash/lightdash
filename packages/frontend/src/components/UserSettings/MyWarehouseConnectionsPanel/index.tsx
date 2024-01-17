import { Button, Collapse, Divider, Stack, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import MantineIcon from '../../common/MantineIcon';
import { CreateCredentialsForm } from './CreateCredentialsForm';
import { CredentialsAndForm } from './CredentialsAndForm';
import { DeleteCredentialsModal } from './DeleteCredentialsModal';

export const MyWarehouseConnectionsPanel = () => {
    const [credentials] = useState([
        {
            name: 'My warehouse connection 1',
            username: 'myusername',
        },
    ]); // TODO: Fetch credentials from database with react-query
    const [isCreatingCredentials, setIsCreatingCredentials] = useState(false);
    const [isEditingWarehouseCredentials, setIsEditingWarehouseCredentials] =
        useState(false);
    const [isDeletingWarehouseCredentials, setIsDeletingWarehouseCredentials] =
        useState<string | undefined>(undefined);

    return (
        <>
            <Stack spacing="xs">
                {credentials.length > 0 ? (
                    credentials.map((credential) => (
                        <Stack key={credential.name} spacing="xs">
                            <CredentialsAndForm
                                credential={credential}
                                isCreatingCredentials={isCreatingCredentials}
                                isEditingWarehouseCredentials={
                                    isEditingWarehouseCredentials
                                }
                                setIsEditingWarehouseCredentials={
                                    setIsEditingWarehouseCredentials
                                }
                                setIsDeletingWarehouseCredentials={
                                    setIsDeletingWarehouseCredentials
                                }
                            />
                        </Stack>
                    ))
                ) : (
                    <Text fs="italic" c="gray.6" fz="xs">
                        You have no credentials saved.
                    </Text>
                )}

                <Divider />

                <Button
                    size="xs"
                    ml="auto"
                    leftIcon={<MantineIcon icon={IconPlus} />}
                    onClick={() => setIsCreatingCredentials(true)}
                    disabled={
                        isCreatingCredentials || isEditingWarehouseCredentials
                    }
                >
                    Add new credentials
                </Button>
                <Collapse in={isCreatingCredentials}>
                    <CreateCredentialsForm
                        setIsCreatingCredentials={setIsCreatingCredentials}
                    />
                </Collapse>
            </Stack>
            <DeleteCredentialsModal
                isDeletingWarehouseCredentials={isDeletingWarehouseCredentials}
                setIsDeletingWarehouseCredentials={
                    setIsDeletingWarehouseCredentials
                }
            />
        </>
    );
};
