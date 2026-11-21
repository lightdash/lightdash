import { type ExternalConnection } from '@lightdash/common';
import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import { useUpdateExternalConnection } from '../hooks/useUpdateExternalConnection';
import { getSalesforceSignInUrl } from './salesforceConnection';

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    connection: ExternalConnection | null;
};

export const SalesforceConnectionModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    connection,
}) => {
    const form = useForm<{ name: string }>({
        initialValues: { name: connection?.name ?? 'Salesforce' },
        validate: {
            name: (value) =>
                value.trim().length === 0 ? 'Name is required' : null,
        },
    });
    const updateMutation = useUpdateExternalConnection();

    const signIn = (connectionUuid: string | null) => {
        if (form.validate().hasErrors) return;
        window.location.assign(
            getSalesforceSignInUrl(
                projectUuid,
                form.values,
                connectionUuid,
                'settings',
            ),
        );
    };

    const handleSave = form.onSubmit(async ({ name }) => {
        if (!connection) {
            signIn(null);
            return;
        }
        await updateMutation.mutateAsync({
            projectUuid,
            connectionUuid: connection.externalConnectionUuid,
            data: { name: name.trim() },
        });
        onClose();
    });

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={connection ? 'Edit Salesforce source' : 'Add Salesforce'}
            confirmLabel={connection ? 'Save' : 'Continue to Salesforce'}
            onConfirm={() => handleSave()}
            confirmLoading={updateMutation.isLoading}
            cancelDisabled={updateMutation.isLoading}
        >
            <Stack gap="sm">
                <Text c="dimmed" fz="sm">
                    AI agents read opportunities, accounts, leads and contacts
                    live, one table each. Salesforce counts and totals the
                    records itself, so most questions take one API call. Fields
                    come from each object, including custom ones; pick which to
                    use after connecting.
                </Text>
                <TextInput
                    required
                    label="Name"
                    description={
                        connection
                            ? undefined
                            : 'Sign in with a user who has the API Enabled permission and can read these objects.'
                    }
                    data-autofocus
                    {...form.getInputProps('name')}
                />
                {connection ? (
                    <Group justify="flex-end">
                        <Button
                            size="xs"
                            variant="default"
                            onClick={() =>
                                signIn(connection.externalConnectionUuid)
                            }
                        >
                            Reconnect to Salesforce
                        </Button>
                    </Group>
                ) : null}
            </Stack>
        </MantineModal>
    );
};
