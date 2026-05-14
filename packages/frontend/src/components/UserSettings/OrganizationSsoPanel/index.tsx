import {
    Button,
    Checkbox,
    Group,
    LoadingOverlay,
    PasswordInput,
    Stack,
    Switch,
    TagsInput,
    Text,
    TextInput,
    Title,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconShieldCheck, IconTrash } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useAllowedEmailDomains } from '../../../hooks/organization/useAllowedDomains';
import {
    useAzureAdSsoConfig,
    useDeleteAzureAdSsoConfig,
    useUpsertAzureAdSsoConfig,
} from '../../../hooks/organization/useOrganizationSso';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';

type FormValues = {
    oauth2ClientId: string;
    oauth2ClientSecret: string;
    oauth2TenantId: string;
    enabled: boolean;
    overrideEmailDomains: boolean;
    emailDomains: string[];
    allowPassword: boolean;
};

const OrganizationSsoPanel: FC = () => {
    const { data: existing, isLoading } = useAzureAdSsoConfig();
    const { data: allowedEmailDomains } = useAllowedEmailDomains();
    const upsert = useUpsertAzureAdSsoConfig();
    const deleteConfig = useDeleteAzureAdSsoConfig();
    const [deleteOpen, setDeleteOpen] = useState(false);

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

    const orgDomains = allowedEmailDomains?.emailDomains ?? [];

    const handleSubmit = form.onSubmit((values) => {
        upsert.mutate({
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
        });
    });

    return (
        <Stack pos="relative" mb="lg">
            <LoadingOverlay visible={isLoading} />
            <Group justify="space-between" align="flex-start">
                <Stack gap="xs">
                    <Title order={5}>Azure Active Directory</Title>
                    <Text c="dimmed" size="sm">
                        Enable Azure AD single sign-on for users in this
                        organization. Users whose email matches the discovery
                        whitelist will see a "Sign in with Microsoft" button on
                        the login page; instance-level SSO providers are
                        suppressed for matched users.
                    </Text>
                </Stack>
                <Switch
                    label="Enabled"
                    checked={form.values.enabled}
                    onChange={(event) =>
                        form.setFieldValue(
                            'enabled',
                            event.currentTarget.checked,
                        )
                    }
                />
            </Group>

            <form onSubmit={handleSubmit}>
                <Stack>
                    <Title order={6} mt="md">
                        Application credentials
                    </Title>
                    <TextInput
                        label="Application (client) ID"
                        placeholder="00000000-0000-0000-0000-000000000000"
                        description="From the Azure AD application's overview page."
                        required
                        {...form.getInputProps('oauth2ClientId')}
                    />
                    <TextInput
                        label="Directory (tenant) ID"
                        placeholder="00000000-0000-0000-0000-000000000000"
                        description="From the Azure AD application's overview page."
                        required
                        {...form.getInputProps('oauth2TenantId')}
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
                        {...form.getInputProps('oauth2ClientSecret')}
                    />

                    <Title order={6} mt="md">
                        Discovery
                    </Title>
                    <Checkbox
                        label="Override organization's allowed email domains"
                        description="When unchecked, users matching any of the organization's allowed email domains see this method."
                        checked={form.values.overrideEmailDomains}
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
                            description="Only users whose email domain matches one of these will see Azure AD. Domains are case-insensitive."
                            placeholder="microsoft.com, contoso.com"
                            value={form.values.emailDomains}
                            onChange={(domains) =>
                                form.setFieldValue('emailDomains', domains)
                            }
                            error={form.errors.emailDomains}
                            clearable
                        />
                    ) : (
                        <Text size="sm" c="dimmed">
                            Using organization's allowed email domains:{' '}
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
                        description="When unchecked, users whose email domain matches Azure AD discovery will not see the password input. Lenient rule: if any matching method allows password, it is shown."
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
                                leftSection={<MantineIcon icon={IconTrash} />}
                                onClick={() => setDeleteOpen(true)}
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
                            {existing ? 'Save changes' : 'Enable Azure AD'}
                        </Button>
                    </Group>
                </Stack>
            </form>

            {deleteOpen && (
                <MantineModal
                    opened
                    onClose={() => setDeleteOpen(false)}
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
        </Stack>
    );
};

export default OrganizationSsoPanel;
