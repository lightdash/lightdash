import { Divider, Stack, Switch } from '@mantine/core';
import { type FC } from 'react';
import {
    useOrganizationSettings,
    useUpdateOrganizationSettings,
} from '../../../hooks/organization/useOrganizationSettings';
import EmptyStateLoader from '../../common/EmptyStateLoader';
import {
    SettingRow,
    SettingsSection,
} from '../../common/Settings/SettingLayout';
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
        <SettingsSection
            label="Account linking"
            description="Control whether single sign-on logins are automatically linked to existing accounts."
        >
            <SettingsCard>
                {isLoading || !data ? (
                    <EmptyStateLoader mih={80} />
                ) : (
                    <Stack gap="md">
                        <SettingRow
                            title="Link SSO identities across providers"
                            description="When a user signs in with a new SSO provider, link it to an existing account that already uses a different provider with the same email."
                            control={
                                <Switch
                                    aria-label="Link SSO identities across providers"
                                    size="md"
                                    checked={oidcLinkingEnabled}
                                    disabled={update.isLoading}
                                    onChange={(event) =>
                                        update.mutate({
                                            oidcLinkingEnabled:
                                                event.currentTarget.checked,
                                        })
                                    }
                                />
                            }
                        />
                        <Divider />
                        <SettingRow
                            title="Link SSO logins to existing accounts by email"
                            description="Link an SSO sign-in to an existing account that has the same verified primary email, regardless of how that account was created."
                            control={
                                <Switch
                                    aria-label="Link SSO logins to existing accounts by email"
                                    size="md"
                                    checked={oidcToEmailLinkingEnabled}
                                    disabled={update.isLoading}
                                    onChange={(event) =>
                                        update.mutate({
                                            oidcToEmailLinkingEnabled:
                                                event.currentTarget.checked,
                                        })
                                    }
                                />
                            }
                        />
                    </Stack>
                )}
            </SettingsCard>
        </SettingsSection>
    );
};

export default AccountLinkingPanel;
