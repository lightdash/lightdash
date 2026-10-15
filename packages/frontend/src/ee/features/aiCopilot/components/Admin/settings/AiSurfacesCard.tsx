import { type SlackSettings } from '@lightdash/common';
import {
    Badge,
    Box,
    Divider,
    Group,
    Stack,
    Switch,
    Text,
    Title,
} from '@mantine/core';
import {
    IconApps,
    IconBrandSlack,
    IconLayoutDashboard,
    IconSparkles,
    type Icon,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { SettingsCard } from '../../../../../../components/common/Settings/SettingsCard';

const SurfaceRow: FC<{
    icon: Icon;
    name: string;
    description: string;
    checked: boolean;
    disabled: boolean;
    onChange: (checked: boolean) => void;
}> = ({ icon, name, description, checked, disabled, onChange }) => (
    <Group wrap="nowrap" align="flex-start" gap="sm">
        <MantineIcon icon={icon} size="lg" color="ldGray.7" />
        <Stack gap={2} flex={1}>
            <Title order={6}>{name}</Title>
            <Text c="dimmed" fz="xs">
                {description}
            </Text>
        </Stack>
        <Switch
            size="md"
            checked={checked}
            disabled={disabled}
            onChange={(event) => onChange(event.currentTarget.checked)}
        />
    </Group>
);

type AiSurfacesCardProps = {
    aiAgentsVisible: boolean;
    // Rolled out per org by feature flag; hidden until then.
    showDataAppRuntimeAi: boolean;
    slackInstallation: SlackSettings | undefined;
    slackAgentsEnabled: boolean;
    isTrial: boolean;
    disabled: boolean;
    isUpdatingSlack: boolean;
    onUpdateAiAgentsVisible: (checked: boolean) => void;
    onUpdateSlackAgentsEnabled: (checked: boolean) => void;
};

export const AiSurfacesCard: FC<AiSurfacesCardProps> = ({
    aiAgentsVisible,
    showDataAppRuntimeAi,
    slackInstallation,
    slackAgentsEnabled,
    isTrial,
    disabled,
    isUpdatingSlack,
    onUpdateAiAgentsVisible,
    onUpdateSlackAgentsEnabled,
}) => {
    const { t } = useTranslation('aiCopilotAdmin');
    const hasSlack = !!slackInstallation?.organizationUuid;

    return (
        <SettingsCard>
            <Stack gap="md">
                <Box>
                    <Group gap="xs">
                        <Title order={5}>
                            {t('settings.surfaces.visibility')}
                        </Title>
                        {isTrial && (
                            <Badge
                                leftSection={
                                    <MantineIcon
                                        icon={IconSparkles}
                                        size={12}
                                    />
                                }
                                size="sm"
                            >
                                {t('settings.surfaces.freeTrial')}
                            </Badge>
                        )}
                    </Group>
                    <Text c="dimmed" fz="xs">
                        {t('settings.surfaces.description')}
                    </Text>
                </Box>
                <SurfaceRow
                    icon={IconLayoutDashboard}
                    name={t('settings.surfaces.lightdashUi')}
                    description={t('settings.surfaces.lightdashUiDescription')}
                    checked={aiAgentsVisible}
                    disabled={disabled}
                    onChange={onUpdateAiAgentsVisible}
                />
                {showDataAppRuntimeAi && (
                    <>
                        <Divider />
                        <Group wrap="nowrap" align="flex-start" gap="sm">
                            <MantineIcon
                                icon={IconApps}
                                size="lg"
                                color="ldGray.7"
                            />
                            <Stack gap={2} flex={1}>
                                <Title order={6}>
                                    {t('settings.surfaces.dataApps')}
                                </Title>
                                <Text c="dimmed" fz="xs">
                                    <Trans
                                        t={t}
                                        i18nKey="settings.surfaces.dataAppsDescription"
                                        components={{
                                            anchor: (
                                                <Text
                                                    span
                                                    component={Link}
                                                    to="/generalSettings/dataApps/aiAnalysis"
                                                    td="underline"
                                                />
                                            ),
                                        }}
                                    />
                                </Text>
                            </Stack>
                        </Group>
                    </>
                )}
                <Divider />
                <SurfaceRow
                    icon={IconBrandSlack}
                    name={t('settings.surfaces.slack')}
                    description={
                        hasSlack
                            ? t('settings.surfaces.slackConnected')
                            : t('settings.surfaces.slackDisconnected')
                    }
                    checked={slackAgentsEnabled}
                    disabled={!hasSlack || isUpdatingSlack}
                    onChange={onUpdateSlackAgentsEnabled}
                />
            </Stack>
        </SettingsCard>
    );
};
