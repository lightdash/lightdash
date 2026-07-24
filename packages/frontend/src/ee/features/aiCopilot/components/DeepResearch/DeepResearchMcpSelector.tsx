import { type AiMcpServer } from '@lightdash/common';
import {
    Alert,
    Checkbox,
    Group,
    Loader,
    Stack,
    Text,
    ThemeIcon,
} from '@mantine-8/core';
import {
    IconAlertCircle,
    IconDatabase,
    IconPlugConnected,
} from '@tabler/icons-react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { isDeepResearchMcpServerReady } from '../../deepResearch/mcpServerReady';
import styles from './DeepResearchPreflight.module.css';

type Props = {
    mcpServers: AiMcpServer[];
    selectedMcpServerUuids: string[];
    onSelectedMcpServerUuidsChange: (mcpServerUuids: string[]) => void;
    isLoading: boolean;
    error: string | null;
};

export const DeepResearchMcpSelector = ({
    mcpServers,
    selectedMcpServerUuids,
    onSelectedMcpServerUuidsChange,
    isLoading,
    error,
}: Props) => {
    const unavailableSelectedServers = mcpServers.filter(
        (server) =>
            selectedMcpServerUuids.includes(server.uuid) &&
            !isDeepResearchMcpServerReady(server),
    );

    const handleServerChange = (serverUuid: string, checked: boolean) => {
        onSelectedMcpServerUuidsChange(
            checked
                ? [...new Set([...selectedMcpServerUuids, serverUuid])]
                : selectedMcpServerUuids.filter(
                      (selectedUuid) => selectedUuid !== serverUuid,
                  ),
        );
    };

    return (
        <Stack gap="xs">
            <Stack gap={2}>
                <Text size="13px" fw={600} lh={1.35}>
                    MCP sources
                </Text>
                <Text size="11px" c="dimmed" lh={1.4}>
                    Choose which of this agent&apos;s connected MCP servers may
                    be used for this run. Their enabled tools, including write
                    actions, can run unattended.
                </Text>
            </Stack>
            <Group gap="xs">
                <Group gap={6} className={styles.source} data-available>
                    <ThemeIcon variant="light" color="indigo" size={22}>
                        <MantineIcon icon={IconDatabase} size={12} />
                    </ThemeIcon>
                    <Text size="11px" lh={1.35}>
                        Agent context and project data
                    </Text>
                </Group>
            </Group>
            {isLoading ? (
                <Group gap="xs">
                    <Loader size="xs" />
                    <Text size="11px" c="dimmed">
                        Checking MCP connections…
                    </Text>
                </Group>
            ) : error ? (
                <Alert
                    color="red"
                    icon={<MantineIcon icon={IconAlertCircle} />}
                    p="xs"
                >
                    {error}
                </Alert>
            ) : mcpServers.length > 0 ? (
                <Stack gap="xs">
                    {mcpServers.map((server) => (
                        <Checkbox
                            key={server.uuid}
                            checked={selectedMcpServerUuids.includes(
                                server.uuid,
                            )}
                            onChange={(event) =>
                                handleServerChange(
                                    server.uuid,
                                    event.currentTarget.checked,
                                )
                            }
                            label={
                                <Group gap={6}>
                                    <MantineIcon
                                        icon={IconPlugConnected}
                                        size={13}
                                    />
                                    <Text span size="11px">
                                        {server.name}
                                    </Text>
                                    {!isDeepResearchMcpServerReady(server) && (
                                        <Text span size="10px" c="red">
                                            connection required
                                        </Text>
                                    )}
                                </Group>
                            }
                        />
                    ))}
                </Stack>
            ) : (
                <Text size="11px" c="dimmed">
                    This agent has no MCP servers attached.
                </Text>
            )}
            {unavailableSelectedServers.length > 0 && (
                <Alert
                    color="orange"
                    icon={<MantineIcon icon={IconAlertCircle} />}
                    p="xs"
                >
                    Connect or disable{' '}
                    {unavailableSelectedServers
                        .map((server) => server.name)
                        .join(', ')}{' '}
                    before starting.
                </Alert>
            )}
        </Stack>
    );
};
