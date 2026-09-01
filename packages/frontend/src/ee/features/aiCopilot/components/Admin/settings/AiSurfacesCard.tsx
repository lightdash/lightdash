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
    IconBrandSlack,
    IconLayoutDashboard,
    IconPlugConnected,
    IconSparkles,
    type Icon,
} from '@tabler/icons-react';
import { type FC } from 'react';
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
    mcpAgentsEnabled: boolean;
    slackInstallation: SlackSettings | undefined;
    slackAgentsEnabled: boolean;
    isTrial: boolean;
    disabled: boolean;
    isUpdatingSlack: boolean;
    onUpdateAiAgentsVisible: (checked: boolean) => void;
    onUpdateMcpAgentsEnabled: (checked: boolean) => void;
    onUpdateSlackAgentsEnabled: (checked: boolean) => void;
};

export const AiSurfacesCard: FC<AiSurfacesCardProps> = ({
    aiAgentsVisible,
    mcpAgentsEnabled,
    slackInstallation,
    slackAgentsEnabled,
    isTrial,
    disabled,
    isUpdatingSlack,
    onUpdateAiAgentsVisible,
    onUpdateMcpAgentsEnabled,
    onUpdateSlackAgentsEnabled,
}) => {
    const hasSlack = !!slackInstallation?.organizationUuid;

    return (
        <SettingsCard>
            <Stack gap="md">
                <Box>
                    <Group gap="xs">
                        <Title order={5}>Visibility</Title>
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
                                Free trial
                            </Badge>
                        )}
                    </Group>
                    <Text c="dimmed" fz="xs">
                        Where agents can be reached. Per-agent access still
                        applies on every surface.
                    </Text>
                </Box>
                <SurfaceRow
                    icon={IconLayoutDashboard}
                    name="Lightdash UI"
                    description="Homepage card, navbar action, and agent chat."
                    checked={aiAgentsVisible}
                    disabled={disabled}
                    onChange={onUpdateAiAgentsVisible}
                />
                <Divider />
                <SurfaceRow
                    icon={IconPlugConnected}
                    name="MCP"
                    description="Agent tools and context for MCP."
                    checked={mcpAgentsEnabled}
                    disabled={disabled}
                    onChange={onUpdateMcpAgentsEnabled}
                />
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
