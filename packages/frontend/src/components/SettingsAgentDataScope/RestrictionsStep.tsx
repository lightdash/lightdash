import { Stack, Switch, Text } from '@mantine/core';

export const RestrictionsStep = ({
    signedInMemberCount,
    memberCount,
    enabled,
    disabled,
    onChange,
}: {
    signedInMemberCount: number;
    memberCount: number;
    enabled: boolean;
    disabled: boolean;
    onChange: (enabled: boolean) => Promise<void>;
}) => (
    <Stack gap="sm">
        <Text fz="sm">
            {signedInMemberCount} of {memberCount} people with access have
            signed in for AI.
        </Text>
        <Text fz="sm">
            With AI access restrictions on, raw SQL from AI agents and MCP is
            off. They answer through the semantic layer, on each person's
            Snowflake sign-in for AI.
        </Text>
        <Switch
            label="AI access restrictions"
            checked={enabled}
            disabled={disabled}
            onChange={(event) => void onChange(event.currentTarget.checked)}
        />
    </Stack>
);
