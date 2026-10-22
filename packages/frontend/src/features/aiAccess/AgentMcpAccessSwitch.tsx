import { type AiOrganizationSettings } from '@lightdash/common';
import { Switch } from '@mantine/core';
import { useUpdateAiOrganizationSettings } from '../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';
import { useOrganization } from '../../hooks/organization/useOrganization';

export const AgentMcpAccessSwitch = ({
    settings,
    setting,
    label,
    description,
}: {
    settings: Pick<
        AiOrganizationSettings,
        'mcpAgentsEnabled' | 'mcpContentWritesEnabled'
    >;
    setting: 'mcpAgentsEnabled' | 'mcpContentWritesEnabled';
    label: string;
    description: string;
}) => {
    const update = useUpdateAiOrganizationSettings();
    const organization = useOrganization();
    const mcpEnabled =
        organization.isSuccess && organization.data.mcpEnabled !== false;
    return (
        <Switch
            aria-label={label}
            label={label}
            description={
                organization.data?.mcpEnabled === false
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
