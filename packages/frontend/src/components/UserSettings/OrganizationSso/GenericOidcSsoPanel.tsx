import {
    Badge,
    Button,
    Checkbox,
    Divider,
    Group,
    PasswordInput,
    Stack,
    Switch,
    TagsInput,
    Text,
    TextInput,
    ThemeIcon,
    Title,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import {
    IconChevronDown,
    IconChevronUp,
    IconLock,
    IconShieldCheck,
    IconTrash,
} from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useToggle } from 'react-use';
import { useAllowedEmailDomains } from '../../../hooks/organization/useAllowedDomains';
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
    const { data: existing, isLoading } = useGenericOidcSsoConfig();
    const { data: allowedEmailDomains } = useAllowedEmailDomains();
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
                value.trim().length === 0 ? 'Client ID is required' : null,
            metadataDocumentEndpoint: (value) =>
                value.trim().length === 0
                    ? 'Discovery document URL is required'
                    : null,
            clientSecret: (value) =>
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

    const orgDomains = allowedEmailDomains?.emailDomains ?? [];

    const handleSubmit = form.onSubmit((values) => {
        upsert.mutate({
            clientId: values.clientId.trim(),
            metadataDocumentEndpoint: values.metadataDocumentEndpoint.trim(),
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
        });
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
                                    Single sign-on via a generic OpenID Connect
                                    provider. Users whose email matches the
                                    discovery whitelist see a "Sign in with
                                    OpenID Connect" button; instance-level SSO
                                    is suppressed for matched users.
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
                                Set up OpenID Connect
                            </Button>
                        )
                    )}

                    <FormSection isOpen={isOpen} name="oidc-configuration">
                        <Stack gap="md">
                            <Divider />
                            <form onSubmit={handleSubmit}>
                                <Stack>
                                    <Title order={6}>
                                        Application credentials
                                    </Title>
                                    <TextInput
                                        label="Discovery document URL"
                                        placeholder="https://idp.example.com/.well-known/openid-configuration"
                                        description="The OIDC discovery document URL for your identity provider."
                                        required
                                        {...form.getInputProps(
                                            'metadataDocumentEndpoint',
                                        )}
                                    />
                                    <TextInput
                                        label="Client ID"
                                        placeholder="your-oidc-client-id"
                                        description="From your identity provider's application settings."
                                        required
                                        {...form.getInputProps('clientId')}
                                    />
                                    <PasswordInput
                                        label="Client secret"
                                        placeholder={
                                            existing
                                                ? 'Leave blank to keep the existing secret'
                                                : 'OIDC client secret value'
                                        }
                                        description="The client secret from your identity provider."
                                        required={!existing}
                                        {...form.getInputProps('clientSecret')}
                                    />

                                    <Title order={6} mt="md">
                                        Advanced
                                    </Title>
                                    <TextInput
                                        label="Scopes"
                                        placeholder="Optional — defaults to openid profile email"
                                        description="Space-separated OAuth scopes to request."
                                        {...form.getInputProps('scopes')}
                                    />

                                    <Title order={6} mt="md">
                                        Discovery
                                    </Title>
                                    <Checkbox
                                        label="Override organization's allowed email domains"
                                        description="When unchecked, users matching any of the organization's allowed email domains see this method."
                                        checked={
                                            form.values.overrideEmailDomains
                                        }
                                        onChange={(event) =>
                                            form.setFieldValue(
                                                'overrideEmailDomains',
                                                event.currentTarget.checked,
                                            )
                                        }
                                    />
                                    {form.values.overrideEmailDomains ? (
                                        <TagsInput
                                            label="Email domains for this method"
                                            description="Only users whose email domain matches one of these will see OpenID Connect. Domains are case-insensitive."
                                            placeholder="acme.com, acme.io"
                                            value={form.values.emailDomains}
                                            onChange={(domains) =>
                                                form.setFieldValue(
                                                    'emailDomains',
                                                    domains,
                                                )
                                            }
                                            error={form.errors.emailDomains}
                                            clearable
                                        />
                                    ) : (
                                        <Text size="sm" c="dimmed">
                                            Using organization's allowed email
                                            domains:{' '}
                                            {orgDomains.length > 0 ? (
                                                <b>{orgDomains.join(', ')}</b>
                                            ) : (
                                                <i>none configured</i>
                                            )}
                                        </Text>
                                    )}

                                    <Title order={6} mt="md">
                                        Password sign-in
                                    </Title>
                                    <Checkbox
                                        label="Allow password sign-in for users matching this method"
                                        description="When unchecked, users whose email domain matches OIDC discovery will not see the password input. Lenient rule: if any matching method allows password, it is shown."
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
                                                : 'Enable OpenID Connect'}
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
                    title="Remove OpenID Connect configuration"
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
                        OpenID Connect via the per-organization configuration.
                    </Text>
                </MantineModal>
            )}
        </SettingsCard>
    );
};

export default GenericOidcSsoPanel;
