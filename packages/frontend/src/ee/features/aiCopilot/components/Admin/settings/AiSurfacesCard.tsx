import { type SlackSettings } from '@lightdash/common';
import { Divider, Stack, Switch, Text } from '@mantine/core';
import {
    IconApps,
    IconBrandSlack,
    IconLayoutDashboard,
    type Icon,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import { SettingsCard } from '../../../../../../components/common/Settings/SettingsCard';
import { SettingRow } from './SettingLayout';

const SurfaceRow: FC<{
    icon: Icon;
    name: string;
    description: string;
    checked: boolean;
    disabled: boolean;
    onChange: (checked: boolean) => void;
}> = ({ icon, name, description, checked, disabled, onChange }) => (
    <SettingRow
        icon={icon}
        title={name}
        description={description}
        control={
            <Switch
                aria-label={name}
                size="md"
                checked={checked}
                disabled={disabled}
                onChange={(event) => onChange(event.currentTarget.checked)}
            />
        }
    />
);

type AiSurfacesCardProps = {
    aiAgentsVisible: boolean;
    // Rolled out per org by feature flag; hidden until then.
    showDataAppRuntimeAi: boolean;
    slackInstallation: SlackSettings | undefined;
    slackAgentsEnabled: boolean;
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
    disabled,
    isUpdatingSlack,
    onUpdateAiAgentsVisible,
    onUpdateSlackAgentsEnabled,
}) => {
    const hasSlack = !!slackInstallation?.organizationUuid;

    return (
        <SettingsCard>
            <Stack gap="md">
                <SurfaceRow
                    icon={IconLayoutDashboard}
                    name="Lightdash UI"
                    description="Homepage card, navbar action, and agent chat."
                    checked={aiAgentsVisible}
                    disabled={disabled}
                    onChange={onUpdateAiAgentsVisible}
                />
                {showDataAppRuntimeAi && (
                    <>
                        <Divider />
                        <SettingRow
                            icon={IconApps}
                            title="Data apps"
                            description={
                                <>
                                    AI analysis inside data apps is configured
                                    under{' '}
                                    <Text
                                        span
                                        inherit
                                        component={Link}
                                        to="/generalSettings/dataApps/aiAnalysis"
                                        td="underline"
                                    >
                                        Data apps · AI analysis
                                    </Text>
                                    .
                                </>
                            }
                        />
                    </>
                )}
                <Divider />
                <SurfaceRow
                    icon={IconBrandSlack}
                    name="Slack"
                    description={
                        hasSlack
                            ? '@mentions and the multi-agent channel.'
                            : "Slack isn't connected. Add the integration in Integrations → Slack first."
                    }
                    checked={slackAgentsEnabled}
                    disabled={!hasSlack || isUpdatingSlack}
                    onChange={onUpdateSlackAgentsEnabled}
                />
            </Stack>
        </SettingsCard>
    );
};
