import { Stack, Switch, Text } from '@mantine/core';
export const AiTwinRestrictionsStep = ({
    enabled,
    disabled,
    onChange,
}: {
    enabled: boolean;
    disabled: boolean;
    onChange: (enabled: boolean) => void;
}) => (
    <Stack gap="sm">
        <Text fz="sm">
            AI agents, the Slack agent and MCP run every Snowflake query as the
            person's AI user, raw SQL included. People without a ready AI user
            get: Your AI identity isn't set up yet. Ask your admin.
        </Text>
        <Switch
            label="AI access restrictions"
            checked={enabled}
            disabled={disabled}
            onChange={(event) => onChange(event.currentTarget.checked)}
        />
    </Stack>
);
