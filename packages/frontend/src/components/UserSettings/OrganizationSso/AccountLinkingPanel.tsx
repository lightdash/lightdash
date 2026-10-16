import { Group, Stack, Switch, Text, ThemeIcon, Title } from '@mantine/core';
import { IconLink } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
    useOrganizationSettings,
    useUpdateOrganizationSettings,
} from '../../../hooks/organization/useOrganizationSettings';
import EmptyStateLoader from '../../common/EmptyStateLoader';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';

const AccountLinkingPanel: FC = () => {
    const { t } = useTranslation('userSettings');
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
                            <Title order={5}>
                                {t('organizationSso.accountLinking.title')}
                            </Title>
                            <Text c="dimmed" size="sm" maw={520}>
                                {t(
                                    'organizationSso.accountLinking.description',
                                )}
                            </Text>
                        </Stack>
                    </Group>

                    <Switch
                        label={t(
                            'organizationSso.accountLinking.linkAcrossProviders',
                        )}
                        description={t(
                            'organizationSso.accountLinking.linkAcrossProvidersDescription',
                        )}
                        checked={oidcLinkingEnabled}
                        disabled={update.isLoading}
                        onChange={(event) =>
                            update.mutate({
                                oidcLinkingEnabled: event.currentTarget.checked,
                            })
                        }
                    />

                    <Switch
                        label={t('organizationSso.accountLinking.linkByEmail')}
                        description={t(
                            'organizationSso.accountLinking.linkByEmailDescription',
                        )}
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
