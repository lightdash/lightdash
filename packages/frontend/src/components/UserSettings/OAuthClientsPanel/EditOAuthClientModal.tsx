import { type OAuthClientSummary } from '@lightdash/common';
import { Button, Stack, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPencil } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useUpdateOAuthClient } from '../../../hooks/useOAuthClients';
import MantineModal from '../../common/MantineModal';

export const EditOAuthClientModal: FC<{
    client: OAuthClientSummary;
    onClose: () => void;
}> = ({ client, onClose }) => {
    const { t } = useTranslation('userSettings');
    const { mutate: updateClient, isLoading } = useUpdateOAuthClient();

    const form = useForm({
        initialValues: {
            clientName: client.clientName,
            redirectUris: client.redirectUris.join('\n'),
        },
        validate: {
            clientName: (value) =>
                value.trim().length === 0
                    ? t('oauthClientsPanel.form.nameRequired')
                    : null,
            redirectUris: (value) => {
                if (value.trim().length === 0)
                    return t('oauthClientsPanel.form.redirectUriRequired');
                const uris = value
                    .split('\n')
                    .map((u) => u.trim())
                    .filter(Boolean);
                for (const uri of uris) {
                    try {
                        new URL(uri);
                    } catch {
                        return t('oauthClientsPanel.form.invalidUri', { uri });
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
            title={t('oauthClientsPanel.editModal.title')}
            icon={IconPencil}
            actions={
                <Button
                    type="submit"
                    form="edit-oauth-client-form"
                    loading={isLoading}
                >
                    {t('oauthClientsPanel.editModal.submit')}
                </Button>
            }
        >
            <form id="edit-oauth-client-form" onSubmit={handleOnSubmit}>
                <Stack>
                    <TextInput
                        label={t('oauthClientsPanel.form.applicationName')}
                        disabled={isLoading}
                        required
                        {...form.getInputProps('clientName')}
                    />
                    <Textarea
                        label={t('oauthClientsPanel.form.redirectUri')}
                        disabled={isLoading}
                        placeholder="https://myapp.example.com/callback"
                        required
                        description={t(
                            'oauthClientsPanel.form.redirectUriDescription',
                        )}
                        minRows={3}
                        {...form.getInputProps('redirectUris')}
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};
