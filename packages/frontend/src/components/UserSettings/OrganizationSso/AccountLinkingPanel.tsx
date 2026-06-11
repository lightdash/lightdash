import { Group, Stack, Switch, Text, ThemeIcon, Title } from '@mantine-8/core';
import { IconLink } from '@tabler/icons-react';
import { type FC } from 'react';
import {
    useOrganizationSettings,
    useUpdateOrganizationSettings,
} from '../../../hooks/organization/useOrganizationSettings';
import EmptyStateLoader from '../../common/EmptyStateLoader';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';

const AccountLinkingPanel: FC = () => {
    const { data, isLoading } = useOrganizationSettings();
    const update = useUpdateOrganizationSettings();

    // The API already returns the effective value (org override resolved
    // against the instance default on the backend), so the panel just shows
    // it. `pending` reflects an in-flight edit optimistically so the toggle
    // doesn't snap back while saving.
    const pending = update.isLoading ? update.variables : undefined;
    const oidcLinkingEnabled =
        pending?.oidcLinkingEnabled ?? data?.oidcLinkingEnabled ?? false;
    const oidcToEmailLinkingEnabled =
        pending?.oidcToEmailLinkingEnabled ??
        data?.oidcToEmailLinkingEnabled ??
        false;

    return (
        <SettingsCard p="lg">
            {isLoading || !data ? (
                <EmptyStateLoader mih={80} />
            ) : (
                <Stack gap="md">
                    <Group gap="sm" wrap="nowrap" align="flex-start">
                        <ThemeIcon
                            variant="light"
                            color="gray"
                            size="lg"
                            radius="sm"
                        >
                            <MantineIcon icon={IconLink} />
                        </ThemeIcon>
                        <Stack gap={2}>
                            <Title order={5}>Account linking</Title>
                            <Text c="dimmed" size="sm" maw={520}>
                                Control whether single sign-on logins are
                                automatically linked to existing accounts.
                            </Text>
                        </Stack>
                    </Group>

                    <Switch
                        label="Link SSO identities across providers"
                        description="When a user signs in with a new SSO provider, link it to an existing account that already uses a different provider with the same email."
                        checked={oidcLinkingEnabled}
                        disabled={update.isLoading}
                        onChange={(event) =>
                            update.mutate({
                                oidcLinkingEnabled: event.currentTarget.checked,
                            })
                        }
                    />

                    <Switch
                        label="Link SSO logins to existing accounts by email"
                        description="Link an SSO sign-in to an existing account that has the same verified primary email, regardless of how that account was created."
                        checked={oidcToEmailLinkingEnabled}
                        disabled={update.isLoading}
                        onChange={(event) =>
                            update.mutate({
                                oidcToEmailLinkingEnabled:
                                    event.currentTarget.checked,
                            })
                        }
                    />
                </Stack>
            )}
        </SettingsCard>
    );
};

export default AccountLinkingPanel;
