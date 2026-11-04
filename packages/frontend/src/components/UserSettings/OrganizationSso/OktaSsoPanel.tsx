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
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconChevronDown,
    IconChevronUp,
    IconShieldCheck,
    IconTrash,
} from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useToggle } from 'react-use';
import {
    useDeleteOktaSsoConfig,
    useOktaSsoConfig,
    useUpsertOktaSsoConfig,
} from '../../../hooks/organization/useOrganizationSso';
import EmptyStateLoader from '../../common/EmptyStateLoader';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import { SettingRow } from '../../common/Settings/SettingLayout';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { OKTA_LOGO } from '../../common/ThirdPartySignInButton/ssoProviderLogos';
import FormSection from '../../ProjectConnection/Inputs/FormSection';
import SsoMethodDomainsField from './SsoMethodDomainsField';
import SsoMissingDomainsWarning from './SsoMissingDomainsWarning';

type FormValues = {
    oauth2Issuer: string;
    oktaDomain: string;
    oauth2ClientId: string;
    oauth2ClientSecret: string;
    authorizationServerId: string;
    extraScopes: string;
    enabled: boolean;
    overrideEmailDomains: boolean;
    emailDomains: string[];
    allowPassword: boolean;
};

const OktaSsoPanel: FC = () => {
    const { data: existing, isLoading } = useOktaSsoConfig();
    const upsert = useUpsertOktaSsoConfig();
    const deleteConfig = useDeleteOktaSsoConfig();
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [isOpen, toggleOpen] = useToggle(false);

    const isConfigured = !!existing;

    const form = useForm<FormValues>({
        initialValues: {
            oauth2Issuer: '',
            oktaDomain: '',
            oauth2ClientId: '',
            oauth2ClientSecret: '',
            authorizationServerId: '',
            extraScopes: '',
            enabled: true,
            overrideEmailDomains: false,
            emailDomains: [],
            allowPassword: true,
        },
        validate: {
            oauth2Issuer: (value) =>
                value.trim().length === 0 ? 'Issuer is required' : null,
            oktaDomain: (value) =>
                value.trim().length === 0 ? 'Okta domain is required' : null,
            oauth2ClientId: (value) =>
                value.trim().length === 0 ? 'Client ID is required' : null,
            oauth2ClientSecret: (value) =>
                !existing && value.trim().length === 0
                    ? 'Client secret is required'
                    : null,
            emailDomains: (value, values) =>
                values.overrideEmailDomains && value.length === 0
                    ? 'Add at least one domain when override is enabled'
                    : null,
        },
    });

    useEffect(() => {
        form.setValues({
            oauth2Issuer: existing?.oauth2Issuer ?? '',
            oktaDomain: existing?.oktaDomain ?? '',
            oauth2ClientId: existing?.oauth2ClientId ?? '',
            oauth2ClientSecret: '',
            authorizationServerId: existing?.authorizationServerId ?? '',
            extraScopes: existing?.extraScopes ?? '',
            enabled: existing?.enabled ?? true,
            overrideEmailDomains: existing?.overrideEmailDomains ?? false,
            emailDomains: existing?.emailDomains ?? [],
            allowPassword: existing?.allowPassword ?? true,
        });
        form.resetDirty();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        existing?.oauth2Issuer,
        existing?.oktaDomain,
        existing?.oauth2ClientId,
        existing?.authorizationServerId,
        existing?.extraScopes,
        existing?.enabled,
        existing?.overrideEmailDomains,
        existing?.emailDomains,
        existing?.allowPassword,
    ]);

    const handleSubmit = form.onSubmit((values) => {
        upsert.mutate(
            {
                oauth2Issuer: values.oauth2Issuer.trim(),
                oktaDomain: values.oktaDomain.trim(),
                oauth2ClientId: values.oauth2ClientId.trim(),
                authorizationServerId:
                    values.authorizationServerId.trim() || null,
                extraScopes: values.extraScopes.trim() || null,
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
            oktaDomain: existing.oktaDomain,
            oauth2ClientId: existing.oauth2ClientId,
            authorizationServerId: existing.authorizationServerId,
            extraScopes: existing.extraScopes,
            enabled,
            overrideEmailDomains: existing.overrideEmailDomains,
            emailDomains: existing.emailDomains,
            allowPassword: existing.allowPassword,
        });
    };

    return (
        <SettingsCard pos="relative">
            {isLoading ? (
                <EmptyStateLoader mih={80} />
            ) : (
                <Stack gap="md">
                    <SettingRow
                        titlePrefix={
                            <Image
                                src={OKTA_LOGO}
                                w={20}
                                h={20}
                                alt="Okta logo"
                            />
                        }
                        title="Okta"
                        description={
                            'Users matching the discovery whitelist see a "Sign in with Okta" button instead of instance-level SSO.'
                        }
                        control={
                            <Group gap="sm" wrap="nowrap">
                                {isConfigured ? (
                                    <Switch
                                        label="Enabled"
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
                                    <Badge variant="outline" size="sm">
                                        Not configured
                                    </Badge>
                                )}
                                {isConfigured ? (
                                    <Button
                                        size="xs"
                                        variant="default"
                                        leftSection={
                                            <MantineIcon
                                                icon={
                                                    isOpen
                                                        ? IconChevronUp
                                                        : IconChevronDown
                                                }
                                            />
                                        }
                                        onClick={() => toggleOpen()}
                                    >
                                        {isOpen
                                            ? 'Hide configuration'
                                            : 'Edit configuration'}
                                    </Button>
                                ) : (
                                    !isOpen && (
                                        <Button
                                            size="xs"
                                            variant="default"
                                            onClick={() => toggleOpen()}
                                        >
                                            Set up Okta
                                        </Button>
                                    )
                                )}
                            </Group>
                        }
                    />

                    {isConfigured && form.values.enabled && !isOpen && (
                        <SsoMissingDomainsWarning providerLabel="Okta" />
                    )}

                    <FormSection isOpen={isOpen} name="okta-configuration">
                        <Stack gap="md">
                            <Divider />
                            <form onSubmit={handleSubmit}>
                                <Stack gap="xl">
                                    <Stack gap="sm">
                                        <Text fw={600} fz="sm">
                                            Application credentials
                                        </Text>
                                        <TextInput
                                            label="Okta domain"
                                            placeholder="your-org.okta.com"
                                            description="Your Okta organization domain (without https://)."
                                            required
                                            {...form.getInputProps(
                                                'oktaDomain',
                                            )}
                                        />
                                        <TextInput
                                            label="Issuer URL"
                                            placeholder="https://your-org.okta.com"
                                            description="The OAuth issuer URL from your Okta application."
                                            required
                                            {...form.getInputProps(
                                                'oauth2Issuer',
                                            )}
                                        />
                                        <TextInput
                                            label="Client ID"
                                            placeholder="0oa1b2c3d4e5f6g7h8i9"
                                            description="From the Okta application's General settings."
                                            required
                                            {...form.getInputProps(
                                                'oauth2ClientId',
                                            )}
                                        />
                                        <PasswordInput
                                            label="Client secret"
                                            placeholder={
                                                existing
                                                    ? 'Leave blank to keep the existing secret'
                                                    : 'Okta client secret value'
                                            }
                                            description="The client secret from the Okta application."
                                            required={!existing}
                                            {...form.getInputProps(
                                                'oauth2ClientSecret',
                                            )}
                                        />
                                    </Stack>
                                    <Stack gap="sm">
                                        <Text fw={600} fz="sm">
                                            Advanced
                                        </Text>
                                        <TextInput
                                            label="Authorization server ID"
                                            placeholder="Optional — for custom authorization servers"
                                            description="Set this only if you use a custom Okta authorization server (API Access Management)."
                                            {...form.getInputProps(
                                                'authorizationServerId',
                                            )}
                                        />
                                        <TextInput
                                            label="Extra scopes"
                                            placeholder="Optional — space-separated, e.g. groups"
                                            description="Additional OAuth scopes requested alongside openid, profile and email."
                                            {...form.getInputProps(
                                                'extraScopes',
                                            )}
                                        />
                                    </Stack>
                                    <Stack gap="sm">
                                        <Text fw={600} fz="sm">
                                            Discovery
                                        </Text>
                                        <SsoMethodDomainsField
                                            providerLabel="Okta"
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
                                    </Stack>
                                    <Stack gap="sm">
                                        <Text fw={600} fz="sm">
                                            Password sign-in
                                        </Text>
                                        <Checkbox
                                            label="Allow password sign-in for users matching this method"
                                            description="When unchecked, users matching Okta discovery don't see the password input, unless another matching method allows it."
                                            checked={form.values.allowPassword}
                                            onChange={(event) =>
                                                form.setFieldValue(
                                                    'allowPassword',
                                                    event.currentTarget.checked,
                                                )
                                            }
                                        />
                                    </Stack>
                                    <Group
                                        justify={
                                            existing
                                                ? 'space-between'
                                                : 'flex-end'
                                        }
                                    >
                                        {existing && (
                                            <Button
                                                variant="subtle"
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
                                                Remove configuration
                                            </Button>
                                        )}
                                        <Button
                                            type="submit"
                                            loading={upsert.isLoading}
                                            disabled={upsert.isLoading}
                                        >
                                            {existing
                                                ? 'Save changes'
                                                : 'Enable Okta'}
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
                    title="Remove Okta configuration"
                    icon={IconShieldCheck}
                    cancelLabel="Cancel"
                    actions={
                        <Button
                            color="red"
                            loading={deleteConfig.isLoading}
                            onClick={async () => {
                                await deleteConfig.mutateAsync();
                                setDeleteOpen(false);
                            }}
                        >
                            Remove
                        </Button>
                    }
                >
                    <Text>
                        After removing this configuration, users in this
                        organization will no longer be able to sign in with Okta
                        via the per-organization configuration.
                    </Text>
                </MantineModal>
            )}
        </SettingsCard>
    );
};

export default OktaSsoPanel;
