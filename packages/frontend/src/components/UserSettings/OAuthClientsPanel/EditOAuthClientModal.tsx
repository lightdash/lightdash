import { type OAuthClientSummary } from '@lightdash/common';
import { Button, Stack, TextInput } from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconPencil } from '@tabler/icons-react';
import { type FC } from 'react';
import { useUpdateOAuthClient } from '../../../hooks/useOAuthClients';
import MantineModal from '../../common/MantineModal';

export const EditOAuthClientModal: FC<{
    client: OAuthClientSummary;
    onClose: () => void;
}> = ({ client, onClose }) => {
    const { mutate: updateClient, isLoading } = useUpdateOAuthClient();

    const form = useForm({
        initialValues: {
            clientName: client.clientName,
            redirectUris: client.redirectUris.join('\n'),
        },
        validate: {
            clientName: (value) =>
                value.trim().length === 0 ? 'Name is required' : null,
            redirectUris: (value) => {
                if (value.trim().length === 0)
                    return 'At least one redirect URI is required';
                const uris = value
                    .split('\n')
                    .map((u) => u.trim())
                    .filter(Boolean);
                for (const uri of uris) {
                    try {
                        new URL(uri);
                    } catch {
                        return `Invalid URI: ${uri}`;
                    }
                }
                return null;
            },
        },
    });

    const handleOnSubmit = form.onSubmit(({ clientName, redirectUris }) => {
        const uris = redirectUris
            .split('\n')
            .map((u) => u.trim())
            .filter(Boolean);
        updateClient(
            {
                clientId: client.clientId,
                data: { clientName, redirectUris: uris },
            },
            { onSuccess: onClose },
        );
    });

    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Edit OAuth application"
            icon={IconPencil}
            actions={
                <Button
                    type="submit"
                    form="edit-oauth-client-form"
                    loading={isLoading}
                >
                    Save changes
                </Button>
            }
        >
            <form id="edit-oauth-client-form" onSubmit={handleOnSubmit}>
                <Stack>
                    <TextInput
                        label="Application name"
                        disabled={isLoading}
                        required
                        {...form.getInputProps('clientName')}
                    />
                    <TextInput
                        label="Redirect URI"
                        disabled={isLoading}
                        required
                        description="One URI per line for multiple redirect URIs"
                        {...form.getInputProps('redirectUris')}
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};
