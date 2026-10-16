import {
    Badge,
    Button,
    Checkbox,
    Divider,
    Group,
    PasswordInput,
    Stack,
    Switch,
    Text,
    TextInput,
    ThemeIcon,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconChevronDown,
    IconChevronUp,
    IconLock,
    IconShieldCheck,
    IconTrash,
} from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';
import {
    useDeleteGenericOidcSsoConfig,
    useGenericOidcSsoConfig,
    useUpsertGenericOidcSsoConfig,
} from '../../../hooks/organization/useOrganizationSso';
import EmptyStateLoader from '../../common/EmptyStateLoader';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import FormSection from '../../ProjectConnection/Inputs/FormSection';
import SsoMethodDomainsField from './SsoMethodDomainsField';
import SsoMissingDomainsWarning from './SsoMissingDomainsWarning';

type FormValues = {
    clientId: string;
    clientSecret: string;
    metadataDocumentEndpoint: string;
    scopes: string;
    enabled: boolean;
    overrideEmailDomains: boolean;
    emailDomains: string[];
    allowPassword: boolean;
};

const GenericOidcSsoPanel: FC = () => {
    const { t } = useTranslation('userSettings');
    const { data: existing, isLoading } = useGenericOidcSsoConfig();
    const upsert = useUpsertGenericOidcSsoConfig();
    const deleteConfig = useDeleteGenericOidcSsoConfig();
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [isOpen, toggleOpen] = useToggle(false);

    const isConfigured = !!existing;

    const form = useForm<FormValues>({
        initialValues: {
            clientId: '',
            clientSecret: '',
            metadataDocumentEndpoint: '',
            scopes: '',
            enabled: true,
            overrideEmailDomains: false,
            emailDomains: [],
            allowPassword: true,
        },
        validate: {
            clientId: (value) =>
                value.trim().length === 0
                    ? t('organizationSso.ssoPanel.validation.clientIdRequired')
                    : null,
            metadataDocumentEndpoint: (value) =>
                value.trim().length === 0
                    ? t('organizationSso.genericOidc.discoveryUrlRequired')
                    : null,
            clientSecret: (value) =>
                !existing && value.trim().length === 0
                    ? t(
                          'organizationSso.ssoPanel.validation.clientSecretRequired',
                      )
                    : null,
            emailDomains: (value, values) =>
                values.overrideEmailDomains && value.length === 0
                    ? t('organizationSso.ssoPanel.validation.domainsRequired')
                    : null,
        },
    });

    useEffect(() => {
        form.setValues({
            clientId: existing?.clientId ?? '',
            clientSecret: '',
            metadataDocumentEndpoint: existing?.metadataDocumentEndpoint ?? '',
            scopes: existing?.scopes ?? '',
            enabled: existing?.enabled ?? true,
            overrideEmailDomains: existing?.overrideEmailDomains ?? false,
            emailDomains: existing?.emailDomains ?? [],
            allowPassword: existing?.allowPassword ?? true,
        });
        form.resetDirty();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        existing?.clientId,
        existing?.metadataDocumentEndpoint,
        existing?.scopes,
        existing?.enabled,
        existing?.overrideEmailDomains,
        existing?.emailDomains,
        existing?.allowPassword,
    ]);

    const handleSubmit = form.onSubmit((values) => {
        upsert.mutate(
            {
                clientId: values.clientId.trim(),
                metadataDocumentEndpoint:
                    values.metadataDocumentEndpoint.trim(),
                scopes: values.scopes.trim() || null,
                enabled: values.enabled,
                overrideEmailDomains: values.overrideEmailDomains,
                emailDomains: values.emailDomains.map((d) =>
                    d.trim().toLowerCase(),
                ),
                allowPassword: values.allowPassword,
                ...(values.clientSecret.trim().length > 0
                    ? { clientSecret: values.clientSecret.trim() }
                    : {}),
            },
            { onSuccess: () => toggleOpen(false) },
        );
    });

    // The Enabled toggle persists immediately (secret omitted = preserved), so
    // turning it off disables sign-in without opening the configuration.
    const handleToggleEnabled = (enabled: boolean) => {
        form.setFieldValue('enabled', enabled);
        if (!existing) return;
        upsert.mutate({
            clientId: existing.clientId,
            metadataDocumentEndpoint: existing.metadataDocumentEndpoint,
            scopes: existing.scopes,
            enabled,
            overrideEmailDomains: existing.overrideEmailDomains,
            emailDomains: existing.emailDomains,
            allowPassword: existing.allowPassword,
        });
    };

    return (
        <SettingsCard p="lg" pos="relative">
            {isLoading ? (
                <EmptyStateLoader mih={80} />
            ) : (
                <Stack gap="md">
                    <Group
                        justify="space-between"
                        align="flex-start"
                        wrap="nowrap"
                    >
                        <Group gap="sm" wrap="nowrap" align="flex-start">
                            <ThemeIcon
                                variant="light"
                                color="gray"
                                size="lg"
                                radius="sm"
                            >
                                <MantineIcon icon={IconLock} />
                            </ThemeIcon>
                            <Stack gap={2}>
                                <Title order={5}>OpenID Connect</Title>
                                <Text c="dimmed" size="sm" maw={460}>
                                    {t(
                                        'organizationSso.genericOidc.description',
                                    )}
                                </Text>
                            </Stack>
                        </Group>
                        {isConfigured ? (
                            <Switch
                                label={t('organizationSso.ssoPanel.enabled')}
                                labelPosition="left"
                                checked={form.values.enabled}
                                disabled={upsert.isLoading}
                                onChange={(event) =>
                                    handleToggleEnabled(
                                        event.currentTarget.checked,
                                    )
                                }
                            />
                        ) : (
                            <Badge variant="outline" size="lg">
                                {t('organizationSso.ssoPanel.notConfigured')}
                            </Badge>
                        )}
                    </Group>

                    {isConfigured ? (
                        <Button
                            variant="default"
                            w="fit-content"
                            leftSection={
                                <MantineIcon
                                    icon={
                                        isOpen ? IconChevronUp : IconChevronDown
                                    }
                                />
                            }
                            onClick={() => toggleOpen()}
                        >
                            {isOpen
                                ? t(
                                      'organizationSso.ssoPanel.hideConfiguration',
                                  )
                                : t(
                                      'organizationSso.ssoPanel.editConfiguration',
                                  )}
                        </Button>
                    ) : (
                        !isOpen && (
                            <Button
                                variant="default"
                                w="fit-content"
                                onClick={() => toggleOpen()}
                            >
                                {t('organizationSso.ssoPanel.setUp', {
                                    provider: 'OpenID Connect',
                                })}
                            </Button>
                        )
                    )}

                    {isConfigured && form.values.enabled && !isOpen && (
                        <SsoMissingDomainsWarning providerLabel="OpenID Connect" />
                    )}

                    <FormSection isOpen={isOpen} name="oidc-configuration">
                        <Stack gap="md">
                            <Divider />
                            <form onSubmit={handleSubmit}>
                                <Stack>
                                    <Title order={6}>
                                        {t(
                                            'organizationSso.ssoPanel.applicationCredentials',
                                        )}
                                    </Title>
                                    <TextInput
                                        label={t(
                                            'organizationSso.genericOidc.discoveryUrl',
                                        )}
                                        placeholder="https://idp.example.com/.well-known/openid-configuration"
                                        description={t(
                                            'organizationSso.genericOidc.discoveryUrlDescription',
                                        )}
                                        required
                                        {...form.getInputProps(
                                            'metadataDocumentEndpoint',
                                        )}
                                    />
                                    <TextInput
                                        label={t(
                                            'organizationSso.ssoPanel.clientId',
                                        )}
                                        placeholder="your-oidc-client-id"
                                        description={t(
                                            'organizationSso.genericOidc.clientIdDescription',
                                        )}
                                        required
                                        {...form.getInputProps('clientId')}
                                    />
                                    <PasswordInput
                                        label={t(
                                            'organizationSso.ssoPanel.clientSecret',
                                        )}
                                        placeholder={
                                            existing
                                                ? t(
                                                      'organizationSso.ssoPanel.keepExistingSecret',
                                                  )
                                                : t(
                                                      'organizationSso.ssoPanel.clientSecretPlaceholder',
                                                      { provider: 'OIDC' },
                                                  )
                                        }
                                        description={t(
                                            'organizationSso.genericOidc.clientSecretDescription',
                                        )}
                                        required={!existing}
                                        {...form.getInputProps('clientSecret')}
                                    />

                                    <Title order={6} mt="md">
                                        {t('organizationSso.ssoPanel.advanced')}
                                    </Title>
                                    <TextInput
                                        label={t(
                                            'organizationSso.genericOidc.scopes',
                                        )}
                                        placeholder={t(
                                            'organizationSso.genericOidc.scopesPlaceholder',
                                        )}
                                        description={t(
                                            'organizationSso.genericOidc.scopesDescription',
                                        )}
                                        {...form.getInputProps('scopes')}
                                    />

                                    <Title order={6} mt="md">
                                        {t(
                                            'organizationSso.ssoPanel.discovery',
                                        )}
                                    </Title>
                                    <SsoMethodDomainsField
                                        providerLabel="OpenID Connect"
                                        override={
                                            form.values.overrideEmailDomains
                                        }
                                        onOverrideChange={(value) =>
                                            form.setFieldValue(
                                                'overrideEmailDomains',
                                                value,
                                            )
                                        }
                                        domains={form.values.emailDomains}
                                        onDomainsChange={(domains) =>
                                            form.setFieldValue(
                                                'emailDomains',
                                                domains,
                                            )
                                        }
                                        error={form.errors.emailDomains}
                                    />

                                    <Title order={6} mt="md">
                                        {t(
                                            'organizationSso.ssoPanel.passwordSignIn',
                                        )}
                                    </Title>
                                    <Checkbox
                                        label={t(
                                            'organizationSso.ssoPanel.allowPassword',
                                        )}
                                        description={t(
                                            'organizationSso.ssoPanel.allowPasswordDescription',
                                            { provider: 'OIDC' },
                                        )}
                                        checked={form.values.allowPassword}
                                        onChange={(event) =>
                                            form.setFieldValue(
                                                'allowPassword',
                                                event.currentTarget.checked,
                                            )
                                        }
                                    />

                                    <Group justify="space-between" mt="md">
                                        {existing ? (
                                            <Button
                                                variant="outline"
                                                color="red"
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconTrash}
                                                    />
                                                }
                                                onClick={() =>
                                                    setDeleteOpen(true)
                                                }
                                            >
                                                {t(
                                                    'organizationSso.ssoPanel.removeConfiguration',
                                                )}
                                            </Button>
                                        ) : (
                                            <div />
                                        )}
                                        <Button
                                            type="submit"
                                            loading={upsert.isLoading}
                                            disabled={upsert.isLoading}
                                        >
                                            {existing
                                                ? t(
                                                      'organizationSso.ssoPanel.saveChanges',
                                                  )
                                                : t(
                                                      'organizationSso.ssoPanel.enable',
                                                      {
                                                          provider:
                                                              'OpenID Connect',
                                                      },
                                                  )}
                                        </Button>
                                    </Group>
                                </Stack>
                            </form>
                        </Stack>
                    </FormSection>
                </Stack>
            )}

            {deleteOpen && (
                <MantineModal
                    opened
                    onClose={() => setDeleteOpen(false)}
                    role="alertdialog"
                    title={t('organizationSso.ssoPanel.removeModalTitle', {
                        provider: 'OpenID Connect',
                    })}
                    icon={IconShieldCheck}
                    cancelLabel={t('actions.cancel', { ns: 'common' })}
                    actions={
                        <Button
                            color="red"
                            loading={deleteConfig.isLoading}
                            onClick={async () => {
                                await deleteConfig.mutateAsync();
                                setDeleteOpen(false);
                            }}
                        >
                            {t('actions.remove', { ns: 'common' })}
                        </Button>
                    }
                >
                    <Text>
                        {t('organizationSso.ssoPanel.removeModalBody', {
                            provider: 'OpenID Connect',
                        })}
                    </Text>
                </MantineModal>
            )}
        </SettingsCard>
    );
};

export default GenericOidcSsoPanel;
