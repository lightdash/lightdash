import { AGENT_IDENTITY_SETTINGS_PATH, FeatureFlags } from '@lightdash/common';
import { Anchor, Group, Stack, Text } from '@mantine/core';
import { IconShieldLock } from '@tabler/icons-react';
import { Link } from 'react-router';
import { useMyAiAccess } from '../../../features/aiAccess/api';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import MantineIcon from '../../common/MantineIcon';

const SnowflakeAgentIdentityIndicator = ({
    projectUuid,
    connection,
}: {
    projectUuid: string;
    connection: string | null;
}) => {
    const { data: flag } = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    const { data: access } = useMyAiAccess(projectUuid, connection);
    if (!flag?.enabled || !access?.requirementSource) return null;
    return (
        <Group gap="xs" align="flex-start" wrap="nowrap">
            <MantineIcon icon={IconShieldLock} color="dimmed" />
            <Stack gap="xs">
                <Text size="sm" c="dimmed">
                    Agent identity required by your organisation. AI queries on
                    this connection run only for people who have connected their
                    agent.
                </Text>
                <Anchor
                    component={Link}
                    to={AGENT_IDENTITY_SETTINGS_PATH}
                    size="sm"
                >
                    Organisation settings
                </Anchor>
            </Stack>
        </Group>
    );
};

export default SnowflakeAgentIdentityIndicator;
