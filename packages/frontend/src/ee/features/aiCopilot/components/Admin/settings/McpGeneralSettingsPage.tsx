import {
    Anchor,
    Box,
    Button,
    Group,
    Loader,
    Stack,
    Switch,
    Text,
    Title,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import ErrorState from '../../../../../../components/common/ErrorState';
import { SettingsCard } from '../../../../../../components/common/Settings/SettingsCard';
import { SettingsPage } from '../../../../../../components/common/Settings/SettingsPage';
import {
    useAiOrganizationAdminSettings,
    useUpdateAiOrganizationSettings,
} from '../../../hooks/useAiOrganizationSettings';

export const McpGeneralSettingsPage = ({
    showAgentsPageLink,
}: {
    showAgentsPageLink: boolean;
}) => {
    const { t } = useTranslation('aiCopilotAdmin');
    const {
        data: settings,
        isInitialLoading: isSettingsLoading,
        isError,
        error,
        refetch,
    } = useAiOrganizationAdminSettings();
    const { mutate: updateSettings, isLoading: isUpdatingSettings } =
        useUpdateAiOrganizationSettings();

    return (
        <SettingsPage
            title={t('settings.mcpGeneral.title')}
            description={t('settings.mcpGeneral.description')}
        >
            {isError ? (
                <SettingsCard>
                    <Stack align="center">
                        <ErrorState error={error?.error} hasMarginTop={false} />
                        <Button
                            variant="default"
                            onClick={() => void refetch()}
                        >
                            {t('settings.mcpGeneral.tryAgain')}
                        </Button>
                    </Stack>
                </SettingsCard>
            ) : isSettingsLoading || !settings ? (
                <Group justify="center" mt="xl">
                    <Loader size="sm" />
                </Group>
            ) : (
                <>
                    <SettingsCard>
                        <Group
                            justify="space-between"
                            wrap="nowrap"
                            align="flex-start"
                            gap="md"
                        >
                            <Box maw={620}>
                                <Title order={5} mb={4}>
                                    {t('settings.mcpGeneral.enableAgents')}
                                </Title>
                                <Text c="dimmed" fz="xs">
                                    {t(
                                        'settings.mcpGeneral.enableAgentsDescription',
                                    )}
                                </Text>
                            </Box>
                            {showAgentsPageLink ? (
                                <Stack gap="xs" align="flex-end">
                                    <Text size="sm">
                                        {settings.mcpAgentsEnabled
                                            ? t('settings.mcpGeneral.on')
                                            : t('settings.mcpGeneral.off')}
                                    </Text>
                                    <Anchor
                                        component={Link}
                                        to="/generalSettings/agentIdentity"
                                        size="sm"
                                    >
                                        {t(
                                            'settings.mcpGeneral.changeOnAgentsPage',
                                        )}
                                    </Anchor>
                                </Stack>
                            ) : (
                                <Switch
                                    size="md"
                                    aria-label={t(
                                        'settings.mcpGeneral.enableAgents',
                                    )}
                                    checked={settings.mcpAgentsEnabled}
                                    disabled={isUpdatingSettings}
                                    onChange={(event) =>
                                        updateSettings({
                                            mcpAgentsEnabled:
                                                event.currentTarget.checked,
                                        })
                                    }
                                />
                            )}
                        </Group>
                    </SettingsCard>

                    <SettingsCard>
                        <Group
                            justify="space-between"
                            wrap="nowrap"
                            align="flex-start"
                            gap="md"
                        >
                            <Box maw={620}>
                                <Title order={5} mb={4}>
                                    {t('settings.mcpGeneral.allowWrites')}
                                </Title>
                                <Text c="dimmed" fz="xs">
                                    {t(
                                        'settings.mcpGeneral.allowWritesDescription',
                                    )}
                                </Text>
                            </Box>
                            <Switch
                                size="md"
                                aria-label={t(
                                    'settings.mcpGeneral.allowWrites',
                                )}
                                checked={settings.mcpContentWritesEnabled}
                                disabled={isUpdatingSettings}
                                onChange={(event) =>
                                    updateSettings({
                                        mcpContentWritesEnabled:
                                            event.currentTarget.checked,
                                    })
                                }
                            />
                        </Group>
                    </SettingsCard>
                </>
            )}
        </SettingsPage>
    );
};
