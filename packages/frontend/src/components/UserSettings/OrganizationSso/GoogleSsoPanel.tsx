import {
    Badge,
    Button,
    Checkbox,
    Divider,
    Group,
    Image,
    Stack,
    Switch,
    Text,
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
import useHealth from '../../../hooks/health/useHealth';
import {
    useAzureAdSsoConfig,
    useDeleteGoogleSsoConfig,
    useGenericOidcSsoConfig,
    useGoogleSsoConfig,
    useOktaSsoConfig,
    useOneLoginSsoConfig,
    useUpsertGoogleSsoConfig,
} from '../../../hooks/organization/useOrganizationSso';
import Callout from '../../common/Callout';
import EmptyStateLoader from '../../common/EmptyStateLoader';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { GOOGLE_LOGO } from '../../common/ThirdPartySignInButton/ssoProviderLogos';
import FormSection from '../../ProjectConnection/Inputs/FormSection';
import SsoMethodDomainsField from './SsoMethodDomainsField';

type FormValues = {
    enabled: boolean;
    overrideEmailDomains: boolean;
    emailDomains: string[];
    allowPassword: boolean;
};

const GoogleSsoPanel: FC = () => {
    const { t } = useTranslation('userSettings');
    const { data: existing, isLoading } = useGoogleSsoConfig();
    const { data: health } = useHealth();
    const { data: oktaConfig } = useOktaSsoConfig();
    const { data: oneLoginConfig } = useOneLoginSsoConfig();
    const { data: azureConfig } = useAzureAdSsoConfig();
    const { data: oidcConfig } = useGenericOidcSsoConfig();
    const upsert = useUpsertGoogleSsoConfig();
    const deleteConfig = useDeleteGoogleSsoConfig();
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [isOpen, toggleOpen] = useToggle(false);

    const isConfigured = !!existing;
    // Google is only usable when the shared instance OAuth app is configured
    // (AUTH_GOOGLE_ENABLED + client id/secret).
    const googleEnabledInstanceWide = !!health?.auth.google.enabled;
    // Only *enabled* per-org providers route the org's domains to themselves
    // and suppress Google during sign-in — a disabled config is ignored by
    // discovery (see OrganizationSsoMethodFlags.enabled). When one is enabled
    // the "on by default" reassurance would be misleading.
    const hasOtherProviderEnabled =
        !!oktaConfig?.enabled ||
        !!oneLoginConfig?.enabled ||
        !!azureConfig?.enabled ||
        !!oidcConfig?.enabled;

    const form = useForm<FormValues>({
        initialValues: {
            enabled: true,
            overrideEmailDomains: false,
            emailDomains: [],
            allowPassword: true,
        },
        validate: {
            emailDomains: (value, values) =>
                values.overrideEmailDomains && value.length === 0
                    ? t('organizationSso.ssoPanel.validation.domainsRequired')
                    : null,
        },
    });

    useEffect(() => {
        form.setValues({
            enabled: existing?.enabled ?? true,
            overrideEmailDomains: existing?.overrideEmailDomains ?? false,
            emailDomains: existing?.emailDomains ?? [],
            allowPassword: existing?.allowPassword ?? true,
        });
        form.resetDirty();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        existing?.enabled,
        existing?.overrideEmailDomains,
        existing?.emailDomains,
        existing?.allowPassword,
    ]);

    const handleSubmit = form.onSubmit((values) => {
        upsert.mutate(
            {
                enabled: values.enabled,
                overrideEmailDomains: values.overrideEmailDomains,
                emailDomains: values.emailDomains.map((d) =>
                    d.trim().toLowerCase(),
                ),
                allowPassword: values.allowPassword,
            },
            { onSuccess: () => toggleOpen(false) },
        );
    });

    // Once configured, the Enabled toggle persists immediately so it can be
    // disabled without reopening the configuration.
    const handleToggleEnabled = (enabled: boolean) => {
        form.setFieldValue('enabled', enabled);
        if (!existing) return;
        upsert.mutate({
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
                                src={GOOGLE_LOGO}
                                w={28}
                                h={28}
                                mt={2}
                                alt={t('organizationSso.ssoPanel.logoAlt', {
                                    provider: 'Google',
                                })}
                            />
                            <Stack gap={2}>
                                <Title order={5}>Google</Title>
                                <Text c="dimmed" size="sm" maw={460}>
                                    {t('organizationSso.google.description')}
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
                                {t('organizationSso.google.usingDefaults')}
                            </Badge>
                        )}
                    </Group>

                    {!isConfigured && googleEnabledInstanceWide && (
                        <Callout
                            variant="info"
                            title={
                                hasOtherProviderEnabled
                                    ? t('organizationSso.google.hiddenTitle')
                                    : t(
                                          'organizationSso.google.onByDefaultTitle',
                                      )
                            }
                        >
                            {hasOtherProviderEnabled
                                ? t('organizationSso.google.hiddenBody')
                                : t('organizationSso.google.onByDefaultBody')}
                        </Callout>
                    )}

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
                                    provider: 'Google',
                                })}
                            </Button>
                        )
                    )}

                    <FormSection isOpen={isOpen} name="google-configuration">
                        <Stack gap="md">
                            <Divider />
                            <form onSubmit={handleSubmit}>
                                <Stack>
                                    <Title order={6}>
                                        {t(
                                            'organizationSso.ssoPanel.discovery',
                                        )}
                                    </Title>
                                    <SsoMethodDomainsField
                                        providerLabel="Google"
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
                                            'organizationSso.google.allowPasswordDescription',
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
                                                      { provider: 'Google' },
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
                        provider: 'Google',
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
                    <Text>{t('organizationSso.google.removeModalBody')}</Text>
                </MantineModal>
            )}
        </SettingsCard>
    );
};

export default GoogleSsoPanel;
