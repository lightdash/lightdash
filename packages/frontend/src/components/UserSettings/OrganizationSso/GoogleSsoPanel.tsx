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
import useHealth from '../../../hooks/health/useHealth';
import {
    useDeleteGoogleSsoConfig,
    useGoogleSsoConfig,
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
    const { data: existing, isLoading } = useGoogleSsoConfig();
    const { data: health } = useHealth();
    const upsert = useUpsertGoogleSsoConfig();
    const deleteConfig = useDeleteGoogleSsoConfig();
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [isOpen, toggleOpen] = useToggle(false);

    const isConfigured = !!existing;
    // Google sign-in is only live on the main login page when the shared
    // instance OAuth app is configured (AUTH_GOOGLE_ENABLED + client id/secret).
    const googleEnabledInstanceWide = !!health?.auth.google.enabled;

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
                    ? 'Add at least one domain when override is enabled'
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
        upsert.mutate({
            enabled: values.enabled,
            overrideEmailDomains: values.overrideEmailDomains,
            emailDomains: values.emailDomains.map((d) =>
                d.trim().toLowerCase(),
            ),
            allowPassword: values.allowPassword,
        });
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
                                alt="Google logo"
                            />
                            <Stack gap={2}>
                                <Title order={5}>Google</Title>
                                <Text c="dimmed" size="sm" maw={460}>
                                    Single sign-on with Google using Lightdash's
                                    shared Google app — no credentials required.
                                    Users whose email matches the discovery
                                    whitelist see a "Sign in with Google"
                                    button.
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
                                Using defaults
                            </Badge>
                        )}
                    </Group>

                    {!isConfigured && googleEnabledInstanceWide && (
                        <Callout
                            variant="info"
                            title="Google sign-in is on by default"
                        >
                            Everyone in your org can sign in with Google from
                            the main login page, using Lightdash's shared Google
                            app. Set up a configuration here to restrict it to
                            specific email domains or to disable password
                            sign-in. If another provider (e.g. Okta) is
                            configured for your domain, it takes over the
                            post-email sign-in step and Google is hidden there
                            unless you enable it here.
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
                                Set up Google
                            </Button>
                        )
                    )}

                    <FormSection isOpen={isOpen} name="google-configuration">
                        <Stack gap="md">
                            <Divider />
                            <form onSubmit={handleSubmit}>
                                <Stack>
                                    <Title order={6}>Discovery</Title>
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
                                        Password sign-in
                                    </Title>
                                    <Checkbox
                                        label="Allow password sign-in for users matching this method"
                                        description="When unchecked, users whose email domain matches will not see the password input. Lenient rule: if any matching method allows password, it is shown."
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
                                                : 'Enable Google'}
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
                    title="Remove Google configuration"
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
                        After removing this configuration, Google sign-in for
                        this organization reverts to the instance default.
                    </Text>
                </MantineModal>
            )}
        </SettingsCard>
    );
};

export default GoogleSsoPanel;
