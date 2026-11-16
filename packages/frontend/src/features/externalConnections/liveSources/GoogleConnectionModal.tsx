import { type ExternalConnection } from '@lightdash/common';
import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import { useNewSourceId } from '../hooks/useNewSourceId';
import {
    LIVE_SOURCE_UPDATE_MESSAGES,
    useUpdateExternalConnection,
} from '../hooks/useUpdateExternalConnection';
import {
    getGoogleSignInUrl,
    getGoogleSource,
    type GoogleConnector,
} from './googleConnection';
import { getApiSourceTarget } from './liveSourceCatalog';
import { LiveSourceHintField } from './LiveSourceHintField';
import { SourceIdField } from './SourceIdField';

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
        initialValues: {
            name: connection?.name ?? source.defaultName,
            aiHint: connection?.aiHint ?? '',
        },
        validate: {
            name: (value) =>
                value.trim().length === 0 ? 'Name is required' : null,
        },
    });
    const updateMutation = useUpdateExternalConnection(
        LIVE_SOURCE_UPDATE_MESSAGES,
    );
    const sourceId = useNewSourceId({
        projectUuid,
        connector,
        name: form.values.name,
        enabled: opened && !connection,
    });

    const signIn = (connectionUuid: string | null) => {
        if (form.validateField('name').hasError) return;
        window.location.assign(
            getGoogleSignInUrl(
                projectUuid,
                connector,
                form.values.name,
                connectionUuid,
                'settings',
                connectionUuid ? undefined : sourceId.value,
            ),
        );
    };

    const handleSave = form.onSubmit(async ({ name, aiHint }) => {
        if (!connection) {
            if (sourceId.isBlocked) return;
            signIn(null);
            return;
        }
        await updateMutation.mutateAsync({
            projectUuid,
            connectionUuid: connection.externalConnectionUuid,
            data: { name: name.trim(), aiHint },
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
            confirmDisabled={sourceId.isBlocked}
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
                <SourceIdField connection={connection} sourceId={sourceId} />
                {connection && (
                    <LiveSourceHintField {...form.getInputProps('aiHint')} />
                )}
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
