import {
    type OrganizationAgentIdentitySnowflakeSetup,
    type UpdateOrganizationSnowflakeAgentClient,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    PasswordInput,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Callout from '../../components/common/Callout';
import { useSaveSnowflakeAgentClient } from './api';

type Client = OrganizationAgentIdentitySnowflakeSetup['client'];

const SnowflakeAgentClientForm = ({
    client,
    onSave,
    onCancel,
    onSaved,
}: {
    client: Client;
    onSave: () => void;
    onCancel: (() => void) | null;
    onSaved: () => void;
}) => {
    const { t } = useTranslation('aiAccess');
    const save = useSaveSnowflakeAgentClient();
    const secretHintId = useId();
    const form = useForm<UpdateOrganizationSnowflakeAgentClient>({
        initialValues: {
            accountUrl:
                client.source === 'organization'
                    ? (client.accountUrl ?? '')
                    : '',
            clientId:
                client.source === 'organization' ? (client.clientId ?? '') : '',
            clientSecret: '',
        },
    });
    const canSave = Object.values(form.values).every((value) => value.trim());
    return (
        <Box
            component="form"
            onSubmit={form.onSubmit((values) => {
                if (!canSave || save.isLoading) return;
                onSave();
                save.mutate(values, {
                    onSuccess: () => {
                        form.setFieldValue('clientSecret', '');
                        save.reset();
                        onSaved();
                    },
                });
            })}
        >
            <Stack gap="sm">
                {client.source === 'organization' &&
                    !client.hasClientSecret && (
                        <Callout variant="warning">
                            {t('snowflakeClient.unreadableSecret')}
                        </Callout>
                    )}
                <TextInput
                    label={t('snowflakeClient.accountUrl')}
                    description={t('snowflakeClient.accountUrlDescription')}
                    placeholder="https://myorg-myaccount.snowflakecomputing.com"
                    disabled={save.isLoading}
                    {...form.getInputProps('accountUrl')}
                />
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                    <TextInput
                        label={t('databricksForm.clientId')}
                        placeholder={t('snowflakeClient.clientIdPlaceholder')}
                        disabled={save.isLoading}
                        {...form.getInputProps('clientId')}
                    />
                    <PasswordInput
                        label={t('databricksForm.clientSecret')}
                        placeholder={t(
                            'snowflakeClient.clientSecretPlaceholder',
                        )}
                        autoComplete="new-password"
                        aria-describedby={secretHintId}
                        disabled={save.isLoading}
                        {...form.getInputProps('clientSecret')}
                    />
                </SimpleGrid>
                <Text id={secretHintId} size="xs" c="dimmed">
                    {t('snowflakeClient.secretHint')}
                </Text>
                {save.error && (
                    <Callout variant="danger">
                        {save.error.error.message}
                    </Callout>
                )}
                <Group gap="xs">
                    <Button
                        type="submit"
                        disabled={!canSave}
                        loading={save.isLoading}
                    >
                        {t('actions.save', { ns: 'common' })}
                    </Button>
                    {onCancel && (
                        <Button
                            variant="subtle"
                            disabled={save.isLoading}
                            onClick={() => {
                                form.setFieldValue('clientSecret', '');
                                save.reset();
                                onCancel();
                            }}
                        >
                            {t('actions.cancel', { ns: 'common' })}
                        </Button>
                    )}
                </Group>
            </Stack>
        </Box>
    );
};

export const SnowflakeAgentClient = ({
    client,
    onSave,
}: {
    client: Client;
    onSave: () => void;
}) => {
    const { t } = useTranslation('aiAccess');
    const [replacing, setReplacing] = useState(false);
    const saved = client.source === 'organization' && client.hasClientSecret;
    return (
        <Stack gap="sm">
            {saved && !replacing ? (
                <>
                    <TextInput
                        label={t('snowflakeClient.accountUrl')}
                        value={client.accountUrl ?? ''}
                        readOnly
                    />
                    <TextInput
                        label={t('databricksForm.clientId')}
                        value={client.clientId ?? ''}
                        readOnly
                    />
                    <Text size="sm">{t('snowflakeClient.secretSaved')}</Text>
                    <Group>
                        <Button
                            variant="default"
                            onClick={() => setReplacing(true)}
                        >
                            {t('snowflakeClient.replaceClient')}
                        </Button>
                    </Group>
                </>
            ) : (
                <SnowflakeAgentClientForm
                    client={client}
                    onSave={onSave}
                    onSaved={() => setReplacing(false)}
                    onCancel={saved ? () => setReplacing(false) : null}
                />
            )}
        </Stack>
    );
};
