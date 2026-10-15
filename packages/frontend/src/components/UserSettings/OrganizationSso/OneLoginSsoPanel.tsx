import {
    Badge,
    Button,
    Checkbox,
    Divider,
    Group,
    Image,
    PasswordInput,
    Stack,
    Switch,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconChevronDown,
    IconChevronUp,
    IconShieldCheck,
    IconTrash,
} from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';
import {
    useDeleteOneLoginSsoConfig,
    useOneLoginSsoConfig,
    useUpsertOneLoginSsoConfig,
} from '../../../hooks/organization/useOrganizationSso';
import EmptyStateLoader from '../../common/EmptyStateLoader';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { ONELOGIN_LOGO } from '../../common/ThirdPartySignInButton/ssoProviderLogos';
import FormSection from '../../ProjectConnection/Inputs/FormSection';
import SsoMethodDomainsField from './SsoMethodDomainsField';
import SsoMissingDomainsWarning from './SsoMissingDomainsWarning';

type FormValues = {
    oauth2Issuer: string;
    oauth2ClientId: string;
    oauth2ClientSecret: string;
    enabled: boolean;
    overrideEmailDomains: boolean;
    emailDomains: string[];
    allowPassword: boolean;
};

const OneLoginSsoPanel: FC = () => {
    const { t } = useTranslation('userSettings');
    const { data: existing, isLoading } = useOneLoginSsoConfig();
    const upsert = useUpsertOneLoginSsoConfig();
    const deleteConfig = useDeleteOneLoginSsoConfig();
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [isOpen, toggleOpen] = useToggle(false);

    const isConfigured = !!existing;

    const form = useForm<FormValues>({
        initialValues: {
            oauth2Issuer: '',
            oauth2ClientId: '',
            oauth2ClientSecret: '',
            enabled: true,
            overrideEmailDomains: false,
            emailDomains: [],
            allowPassword: true,
        },
        validate: {
            oauth2Issuer: (value) =>
                value.trim().length === 0
                    ? t('organizationSso.ssoPanel.validation.issuerRequired')
                    : null,
            oauth2ClientId: (value) =>
                value.trim().length === 0
                    ? t('organizationSso.ssoPanel.validation.clientIdRequired')
                    : null,
            oauth2ClientSecret: (value) =>
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
            oauth2Issuer: existing?.oauth2Issuer ?? '',
            oauth2ClientId: existing?.oauth2ClientId ?? '',
            oauth2ClientSecret: '',
            enabled: existing?.enabled ?? true,
            overrideEmailDomains: existing?.overrideEmailDomains ?? false,
            emailDomains: existing?.emailDomains ?? [],
            allowPassword: existing?.allowPassword ?? true,
        });
        form.resetDirty();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        existing?.oauth2Issuer,
        existing?.oauth2ClientId,
        existing?.enabled,
        existing?.overrideEmailDomains,
        existing?.emailDomains,
        existing?.allowPassword,
    ]);

    const handleSubmit = form.onSubmit((values) => {
        upsert.mutate(
            {
                oauth2Issuer: values.oauth2Issuer.trim(),
                oauth2ClientId: values.oauth2ClientId.trim(),
                enabled: values.enabled,
                overrideEmailDomains: values.overrideEmailDomains,
                emailDomains: values.emailDomains.map((d) =>
                    d.trim().toLowerCase(),
                ),
                allowPassword: values.allowPassword,
                ...(values.oauth2ClientSecret.trim().length > 0
                    ? { oauth2ClientSecret: values.oauth2ClientSecret.trim() }
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
            oauth2Issuer: existing.oauth2Issuer,
            oauth2ClientId: existing.oauth2ClientId,
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
                            <Image
                                src={ONELOGIN_LOGO}
                                w={28}
                                h={28}
                                mt={2}
                                alt={t('organizationSso.ssoPanel.logoAlt', {
                                    provider: 'OneLogin',
                                })}
                            />
                            <Stack gap={2}>
                                <Title order={5}>OneLogin</Title>
                                <Text c="dimmed" size="sm" maw={460}>
                                    {t('organizationSso.oneLogin.description')}
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
                                    provider: 'OneLogin',
                                })}
                            </Button>
                        )
                    )}

                    {isConfigured && form.values.enabled && !isOpen && (
                        <SsoMissingDomainsWarning providerLabel="OneLogin" />
                    )}

                    <FormSection isOpen={isOpen} name="onelogin-configuration">
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
                                            'organizationSso.ssoPanel.issuerUrl',
                                        )}
                                        placeholder="https://your-org.onelogin.com"
                                        description={t(
                                            'organizationSso.oneLogin.issuerDescription',
                                        )}
                                        required
                                        {...form.getInputProps('oauth2Issuer')}
                                    />
                                    <TextInput
                                        label={t(
                                            'organizationSso.ssoPanel.clientId',
                                        )}
                                        placeholder="your-onelogin-client-id"
                                        description={t(
                                            'organizationSso.oneLogin.clientIdDescription',
                                        )}
                                        required
                                        {...form.getInputProps(
                                            'oauth2ClientId',
                                        )}
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
                                                      { provider: 'OneLogin' },
                                                  )
                                        }
                                        description={t(
                                            'organizationSso.oneLogin.clientSecretDescription',
                                        )}
                                        required={!existing}
                                        {...form.getInputProps(
                                            'oauth2ClientSecret',
                                        )}
                                    />

                                    <Title order={6} mt="md">
                                        {t(
                                            'organizationSso.ssoPanel.discovery',
                                        )}
                                    </Title>
                                    <SsoMethodDomainsField
                                        providerLabel="OneLogin"
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
                                            { provider: 'OneLogin' },
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
                                                      { provider: 'OneLogin' },
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
                        provider: 'OneLogin',
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
                            provider: 'OneLogin',
                        })}
                    </Text>
                </MantineModal>
            )}
        </SettingsCard>
    );
};

export default OneLoginSsoPanel;
