import { type AiOrganizationSettings } from '@lightdash/common';
import { Switch } from '@mantine/core';
import { useUpdateAiOrganizationSettings } from '../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';

export const AgentMcpAccessSwitch = ({
    settings,
    setting,
    label,
    description,
}: {
    settings: Pick<
        AiOrganizationSettings,
        'mcpEnabled' | 'mcpAgentsEnabled' | 'mcpContentWritesEnabled'
    >;
    setting: 'mcpAgentsEnabled' | 'mcpContentWritesEnabled';
    label: string;
    description: string;
}) => {
    const update = useUpdateAiOrganizationSettings();
    const mcpEnabled = settings.mcpEnabled !== false;
    return (
        <Switch
            aria-label={label}
            label={label}
            description={
                settings.mcpEnabled === false
                    ? 'MCP access is disabled for this organization.'
                    : description
            }
            checked={settings[setting]}
            disabled={update.isLoading || !mcpEnabled}
            onChange={(event) =>
                update.mutate({ [setting]: event.currentTarget.checked })
            }
        />
    );
};
