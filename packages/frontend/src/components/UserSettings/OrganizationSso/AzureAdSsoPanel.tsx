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
    useAzureAdSsoConfig,
    useDeleteAzureAdSsoConfig,
    useUpsertAzureAdSsoConfig,
} from '../../../hooks/organization/useOrganizationSso';
import EmptyStateLoader from '../../common/EmptyStateLoader';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import { SettingRow } from '../../common/Settings/SettingLayout';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { MICROSOFT_LOGO } from '../../common/ThirdPartySignInButton/ssoProviderLogos';
import FormSection from '../../ProjectConnection/Inputs/FormSection';
import SsoMethodDomainsField from './SsoMethodDomainsField';
import SsoMissingDomainsWarning from './SsoMissingDomainsWarning';

type FormValues = {
    oauth2ClientId: string;
    oauth2ClientSecret: string;
    oauth2TenantId: string;
    enabled: boolean;
    overrideEmailDomains: boolean;
    emailDomains: string[];
    allowPassword: boolean;
};

const AzureAdSsoPanel: FC = () => {
    const { data: existing, isLoading } = useAzureAdSsoConfig();
    const upsert = useUpsertAzureAdSsoConfig();
    const deleteConfig = useDeleteAzureAdSsoConfig();
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [isOpen, toggleOpen] = useToggle(false);

    const isConfigured = !!existing;

    const form = useForm<FormValues>({
        initialValues: {
            oauth2ClientId: '',
            oauth2ClientSecret: '',
            oauth2TenantId: '',
            enabled: true,
            overrideEmailDomains: false,
            emailDomains: [],
            allowPassword: true,
        },
        validate: {
            oauth2ClientId: (value) =>
                value.trim().length === 0 ? 'Client ID is required' : null,
            oauth2TenantId: (value) =>
                value.trim().length === 0 ? 'Tenant ID is required' : null,
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
            oauth2ClientId: existing?.oauth2ClientId ?? '',
            oauth2ClientSecret: '',
            oauth2TenantId: existing?.oauth2TenantId ?? '',
            enabled: existing?.enabled ?? true,
            overrideEmailDomains: existing?.overrideEmailDomains ?? false,
            emailDomains: existing?.emailDomains ?? [],
            allowPassword: existing?.allowPassword ?? true,
        });
        form.resetDirty();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        existing?.oauth2ClientId,
        existing?.oauth2TenantId,
        existing?.enabled,
        existing?.overrideEmailDomains,
        existing?.emailDomains,
        existing?.allowPassword,
    ]);

    const handleSubmit = form.onSubmit((values) => {
        upsert.mutate(
            {
                oauth2ClientId: values.oauth2ClientId.trim(),
                oauth2TenantId: values.oauth2TenantId.trim(),
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
            oauth2ClientId: existing.oauth2ClientId,
            oauth2TenantId: existing.oauth2TenantId,
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
                                src={MICROSOFT_LOGO}
                                w={20}
                                h={20}
                                alt="Microsoft logo"
                            />
                        }
                        title="Azure Active Directory"
                        description={
                            'Users matching the discovery whitelist see a "Sign in with Microsoft" button instead of instance-level SSO.'
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
                                            Set up Azure AD
                                        </Button>
                                    )
                                )}
                            </Group>
                        }
                    />

                    {isConfigured && form.values.enabled && !isOpen && (
                        <SsoMissingDomainsWarning providerLabel="Azure AD" />
                    )}

                    <FormSection isOpen={isOpen} name="azuread-configuration">
                        <Stack gap="md">
                            <Divider />
                            <form onSubmit={handleSubmit}>
                                <Stack gap="xl">
                                    <Stack gap="sm">
                                        <Text fw={600} fz="sm">
                                            Application credentials
                                        </Text>
                                        <TextInput
                                            label="Application (client) ID"
                                            placeholder="00000000-0000-0000-0000-000000000000"
                                            description="From the Azure AD application's overview page."
                                            required
                                            {...form.getInputProps(
                                                'oauth2ClientId',
                                            )}
                                        />
                                        <TextInput
                                            label="Directory (tenant) ID"
                                            placeholder="00000000-0000-0000-0000-000000000000"
                                            description="From the Azure AD application's overview page."
                                            required
                                            {...form.getInputProps(
                                                'oauth2TenantId',
                                            )}
                                        />
                                        <PasswordInput
                                            label="Client secret"
                                            placeholder={
                                                existing
                                                    ? 'Leave blank to keep the existing secret'
                                                    : 'Azure AD client secret value'
                                            }
                                            description="The secret value from Azure AD (not the secret ID)."
                                            required={!existing}
                                            {...form.getInputProps(
                                                'oauth2ClientSecret',
                                            )}
                                        />
                                    </Stack>
                                    <Stack gap="sm">
                                        <Text fw={600} fz="sm">
                                            Discovery
                                        </Text>
                                        <SsoMethodDomainsField
                                            providerLabel="Azure AD"
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
                                            description="When unchecked, users matching Azure AD discovery don't see the password input, unless another matching method allows it."
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
                                                : 'Enable Azure AD'}
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
                    title="Remove Azure AD configuration"
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
                        organization will no longer be able to sign in with
                        Azure AD via the per-organization configuration.
                    </Text>
                </MantineModal>
            )}
        </SettingsCard>
    );
};

export default AzureAdSsoPanel;
