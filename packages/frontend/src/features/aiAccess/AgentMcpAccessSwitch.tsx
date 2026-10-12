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
        'mcpAgentsEnabled' | 'mcpContentWritesEnabled'
    >;
    setting: 'mcpAgentsEnabled' | 'mcpContentWritesEnabled';
    label: string;
    description: string;
}) => {
    const update = useUpdateAiOrganizationSettings();
    return (
        <Switch
            aria-label={label}
            label={label}
            description={description}
            checked={settings[setting]}
            disabled={update.isLoading}
            onChange={(event) =>
                update.mutate({ [setting]: event.currentTarget.checked })
            }
        />
    );
};
