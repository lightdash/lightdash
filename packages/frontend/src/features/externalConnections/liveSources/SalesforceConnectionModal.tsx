import {
    ApiConnectorType,
    SALESFORCE_OBJECTS,
    type ExternalConnection,
    type SalesforceObject,
} from '@lightdash/common';
import { Button, Group, Select, Stack, Text, TextInput } from '@mantine/core';
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

const OBJECT_LABELS: Record<SalesforceObject, string> = {
    Opportunity: 'Opportunities',
    Account: 'Accounts',
    Lead: 'Leads',
    Contact: 'Contacts',
};

export const SalesforceConnectionModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    connection,
}) => {
    const saved =
        connection?.apiSource?.connector === ApiConnectorType.SALESFORCE
            ? connection.apiSource
            : null;
    const form = useForm<{
        name: string;
        object: SalesforceObject;
    }>({
        initialValues: {
            name: connection?.name ?? 'Salesforce',
            object: saved?.object ?? 'Opportunity',
        },
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
                    AI agents read one Salesforce object live. Salesforce counts
                    and totals the records itself, so most questions take one
                    API call. Fields come from the object, including custom
                    ones; pick which to use after connecting.
                </Text>
                <TextInput
                    required
                    label="Name"
                    data-autofocus
                    {...form.getInputProps('name')}
                />
                {saved ? (
                    <Group justify="space-between" wrap="nowrap">
                        <Text fz="sm" c="dimmed" truncate>
                            Reads {OBJECT_LABELS[saved.object].toLowerCase()}
                        </Text>
                        <Button
                            size="xs"
                            variant="default"
                            onClick={() =>
                                signIn(
                                    connection?.externalConnectionUuid ?? null,
                                )
                            }
                        >
                            Reconnect to Salesforce
                        </Button>
                    </Group>
                ) : (
                    <Select
                        required
                        label="Object"
                        description="Sign in with a user who can read this object and has the API Enabled permission."
                        data={SALESFORCE_OBJECTS.map((object) => ({
                            value: object,
                            label: OBJECT_LABELS[object],
                        }))}
                        allowDeselect={false}
                        {...form.getInputProps('object')}
                    />
                )}
            </Stack>
        </MantineModal>
    );
};
