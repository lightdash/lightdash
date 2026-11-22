import {
    ApiConnectorType,
    type ExternalConnection,
    type SalesforceEnvironment,
} from '@lightdash/common';
import {
    Button,
    Group,
    Input,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import { useUpdateExternalConnection } from '../hooks/useUpdateExternalConnection';
import { LiveSourceTitle } from './LiveSourceIcon';
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
    const form = useForm<{ name: string; environment: SalesforceEnvironment }>({
        initialValues: {
            name: connection?.name ?? 'Salesforce',
            environment: 'production',
        },
        validate: {
            name: (value) =>
                value.trim().length === 0 ? 'Give it a name' : null,
        },
    });
    const updateMutation = useUpdateExternalConnection();

    const signIn = (connectionUuid: string | null) => {
        if (form.validate().hasErrors) return;
        window.location.assign(
            getSalesforceSignInUrl(
                projectUuid,
                // A reconnect keeps the source's own login host
                connectionUuid ? { name: form.values.name } : form.values,
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
            title={
                <LiveSourceTitle connector={ApiConnectorType.SALESFORCE}>
                    {connection ? 'Edit Salesforce source' : 'Add Salesforce'}
                </LiveSourceTitle>
            }
            confirmLabel={connection ? 'Save' : 'Continue to Salesforce'}
            onConfirm={() => handleSave()}
            confirmLoading={updateMutation.isLoading}
            cancelDisabled={updateMutation.isLoading}
        >
            <Stack gap="sm">
                <Text c="dimmed" fz="sm">
                    Reads opportunities, accounts, leads and contacts, and you
                    pick their fields after connecting
                </Text>
                <TextInput
                    required
                    label="Name"
                    description={
                        connection
                            ? undefined
                            : 'Sign in as a user with API Enabled who can read these objects'
                    }
                    data-autofocus
                    {...form.getInputProps('name')}
                />
                {connection ? null : (
                    <Input.Wrapper
                        label="Environment"
                        description="Pick Sandbox if you sign in at test.salesforce.com"
                    >
                        <SegmentedControl
                            mt={4}
                            data={[
                                { value: 'production', label: 'Production' },
                                { value: 'sandbox', label: 'Sandbox' },
                            ]}
                            {...form.getInputProps('environment')}
                        />
                    </Input.Wrapper>
                )}
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
