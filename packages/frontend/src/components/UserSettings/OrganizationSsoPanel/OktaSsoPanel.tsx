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
    useDeleteOktaSsoConfig,
    useOktaSsoConfig,
    useUpsertOktaSsoConfig,
} from '../../../hooks/organization/useOrganizationSso';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';

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
    const { data: allowedEmailDomains } = useAllowedEmailDomains();
    const upsert = useUpsertOktaSsoConfig();
    const deleteConfig = useDeleteOktaSsoConfig();
    const [deleteOpen, setDeleteOpen] = useState(false);

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

    const orgDomains = allowedEmailDomains?.emailDomains ?? [];

    const handleSubmit = form.onSubmit((values) => {
        upsert.mutate({
            oauth2Issuer: values.oauth2Issuer.trim(),
            oktaDomain: values.oktaDomain.trim(),
            oauth2ClientId: values.oauth2ClientId.trim(),
            authorizationServerId: values.authorizationServerId.trim() || null,
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
        });
    });

    return (
        <Stack pos="relative" mb="lg">
            <LoadingOverlay visible={isLoading} />
            <Switch
                label="Enabled"
                checked={form.values.enabled}
                onChange={(event) =>
                    form.setFieldValue('enabled', event.currentTarget.checked)
                }
            />

            <form onSubmit={handleSubmit}>
                <Stack>
                    <Title order={6} mt="md">
                        Application credentials
                    </Title>
                    <TextInput
                        label="Okta domain"
                        placeholder="your-org.okta.com"
                        description="Your Okta organization domain (without https://)."
                        required
                        {...form.getInputProps('oktaDomain')}
                    />
                    <TextInput
                        label="Issuer URL"
                        placeholder="https://your-org.okta.com"
                        description="The OAuth issuer URL from your Okta application."
                        required
                        {...form.getInputProps('oauth2Issuer')}
                    />
                    <TextInput
                        label="Client ID"
                        placeholder="0oa1b2c3d4e5f6g7h8i9"
                        description="From the Okta application's General settings."
                        required
                        {...form.getInputProps('oauth2ClientId')}
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
                        {...form.getInputProps('oauth2ClientSecret')}
                    />

                    <Title order={6} mt="md">
                        Advanced
                    </Title>
                    <TextInput
                        label="Authorization server ID"
                        placeholder="Optional — for custom authorization servers"
                        description="Set this only if you use a custom Okta authorization server (API Access Management)."
                        {...form.getInputProps('authorizationServerId')}
                    />
                    <TextInput
                        label="Extra scopes"
                        placeholder="Optional — space-separated, e.g. groups"
                        description="Additional OAuth scopes requested alongside openid, profile and email."
                        {...form.getInputProps('extraScopes')}
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
                            description="Only users whose email domain matches one of these will see Okta. Domains are case-insensitive."
                            placeholder="acme.com, acme.io"
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
                        description="When unchecked, users whose email domain matches Okta discovery will not see the password input. Lenient rule: if any matching method allows password, it is shown."
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
                            {existing ? 'Save changes' : 'Enable Okta'}
                        </Button>
                    </Group>
                </Stack>
            </form>

            {deleteOpen && (
                <MantineModal
                    opened
                    onClose={() => setDeleteOpen(false)}
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
        </Stack>
    );
};

export default OktaSsoPanel;
