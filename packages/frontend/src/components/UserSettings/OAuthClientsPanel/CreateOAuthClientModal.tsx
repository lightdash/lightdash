import { Button, Stack, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPlug } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateOAuthClient } from '../../../hooks/useOAuthClients';
import Callout from '../../common/Callout';
import { CopyActionIcon } from '../../common/CopyActionIcon';
import MantineModal from '../../common/MantineModal';

export const CreateOAuthClientModal: FC<{
    onClose: () => void;
}> = ({ onClose }) => {
    const { t } = useTranslation('userSettings');
    const {
        data,
        mutate: createClient,
        isLoading,
        isSuccess,
    } = useCreateOAuthClient();

    const form = useForm({
        initialValues: {
            clientName: '',
            redirectUris: '',
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
        createClient({ clientName, redirectUris: uris });
    });

    return (
        <MantineModal
            opened
            onClose={onClose}
            role="alertdialog"
            title={
                isSuccess
                    ? t('oauthClientsPanel.createModal.registeredTitle')
                    : t('oauthClientsPanel.createModal.title')
            }
            cancelLabel={
                isSuccess
                    ? t('actions.close', { ns: 'common' })
                    : t('actions.cancel', { ns: 'common' })
            }
            icon={IconPlug}
            actions={
                !isSuccess ? (
                    <Button
                        type="submit"
                        form="create-oauth-client-form"
                        loading={isLoading}
                    >
                        {t('oauthClientsPanel.createModal.submit')}
                    </Button>
                ) : undefined
            }
        >
            {!isSuccess ? (
                <form id="create-oauth-client-form" onSubmit={handleOnSubmit}>
                    <Stack>
                        <TextInput
                            label={t('oauthClientsPanel.form.applicationName')}
                            disabled={isLoading}
                            placeholder={t(
                                'oauthClientsPanel.form.applicationNamePlaceholder',
                            )}
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
                            {...form.getInputProps('redirectUris')}
                        />
                    </Stack>
                </form>
            ) : (
                <Stack gap="md">
                    <TextInput
                        label={t('oauthClientsPanel.createModal.clientId')}
                        readOnly
                        value={data?.clientId}
                        rightSection={
                            <CopyActionIcon
                                value={data?.clientId ?? ''}
                                tooltipPosition="right"
                            />
                        }
                    />
                    <TextInput
                        label={t('oauthClientsPanel.createModal.clientSecret')}
                        readOnly
                        className="sentry-block ph-no-capture"
                        value={data?.clientSecret}
                        rightSection={
                            <CopyActionIcon
                                value={data?.clientSecret ?? ''}
                                tooltipPosition="right"
                            />
                        }
                    />
                    <Callout variant="warning">
                        {t('oauthClientsPanel.createModal.copySecretWarning')}
                    </Callout>
                </Stack>
            )}
        </MantineModal>
    );
};
