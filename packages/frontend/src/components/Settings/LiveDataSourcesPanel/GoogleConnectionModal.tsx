import { type ExternalConnection } from '@lightdash/common';
import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import { useUpdateExternalConnection } from '../../../features/externalConnections/hooks/useUpdateExternalConnection';
import MantineModal from '../../common/MantineModal';
import {
    getApiSourceTarget,
    getGoogleSignInUrl,
    getGoogleSource,
    type GoogleConnector,
} from './googleConnection';

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    connector: GoogleConnector;
    connection: ExternalConnection | null;
};

export const GoogleConnectionModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    connector,
    connection,
}) => {
    const source = getGoogleSource(connector);
    const form = useForm({
        initialValues: { name: connection?.name ?? source.defaultName },
        validate: {
            name: (value) =>
                value.trim().length === 0 ? 'Name is required' : null,
        },
    });
    const updateMutation = useUpdateExternalConnection();

    const signIn = (connectionUuid: string | null) => {
        if (form.validateField('name').hasError) return;
        window.location.assign(
            getGoogleSignInUrl(
                projectUuid,
                connector,
                form.values.name,
                connectionUuid,
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
                connection
                    ? `Edit ${source.label} source`
                    : `Add ${source.label}`
            }
            confirmLabel={connection ? 'Save' : 'Continue to Google'}
            onConfirm={() => handleSave()}
            confirmLoading={updateMutation.isLoading}
            cancelDisabled={updateMutation.isLoading}
        >
            <Stack gap="sm">
                <Text c="dimmed" fz="sm">
                    {source.description}{' '}
                    {connection
                        ? 'Reconnect to sign in again with a Google account that can read it.'
                        : 'Sign in with Google to allow read-only access, then pick what the source reads.'}
                </Text>
                <TextInput
                    required
                    label="Name"
                    data-autofocus
                    {...form.getInputProps('name')}
                />
                {connection?.apiSource && (
                    <Group justify="space-between" wrap="nowrap">
                        <Text fz="sm" c="dimmed" truncate>
                            Reads {getApiSourceTarget(connection.apiSource)}
                        </Text>
                        <Button
                            size="xs"
                            variant="default"
                            onClick={() =>
                                signIn(connection.externalConnectionUuid)
                            }
                        >
                            Reconnect to Google
                        </Button>
                    </Group>
                )}
            </Stack>
        </MantineModal>
    );
};
