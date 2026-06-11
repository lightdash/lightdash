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
} from '@mantine-8/core';
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
                value.trim().length === 0 ? 'Issuer is required' : null,
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
                                alt="OneLogin logo"
                            />
                            <Stack gap={2}>
                                <Title order={5}>OneLogin</Title>
                                <Text c="dimmed" size="sm" maw={460}>
                                    Single sign-on via OneLogin. Users whose
                                    email matches the discovery whitelist see a
                                    "Sign in with OneLogin" button;
                                    instance-level SSO is suppressed for matched
                                    users.
                                </Text>
                            </Stack>
                        </Group>
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
                            <Badge color="gray" variant="outline" size="lg">
                                Not configured
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
                                ? 'Hide configuration'
                                : 'Edit configuration'}
                        </Button>
                    ) : (
                        !isOpen && (
                            <Button
                                variant="default"
                                w="fit-content"
                                onClick={() => toggleOpen()}
                            >
                                Set up OneLogin
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
                                        Application credentials
                                    </Title>
                                    <TextInput
                                        label="Issuer URL"
                                        placeholder="https://your-org.onelogin.com"
                                        description="Your OneLogin OIDC issuer URL."
                                        required
                                        {...form.getInputProps('oauth2Issuer')}
                                    />
                                    <TextInput
                                        label="Client ID"
                                        placeholder="your-onelogin-client-id"
                                        description="From the OneLogin application's SSO settings."
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
                                                : 'OneLogin client secret value'
                                        }
                                        description="The client secret from the OneLogin application."
                                        required={!existing}
                                        {...form.getInputProps(
                                            'oauth2ClientSecret',
                                        )}
                                    />

                                    <Title order={6} mt="md">
                                        Discovery
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
                                        Password sign-in
                                    </Title>
                                    <Checkbox
                                        label="Allow password sign-in for users matching this method"
                                        description="When unchecked, users whose email domain matches OneLogin discovery will not see the password input. Lenient rule: if any matching method allows password, it is shown."
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
                                                Remove configuration
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
                                                ? 'Save changes'
                                                : 'Enable OneLogin'}
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
                    title="Remove OneLogin configuration"
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
                        OneLogin via the per-organization configuration.
                    </Text>
                </MantineModal>
            )}
        </SettingsCard>
    );
};

export default OneLoginSsoPanel;
