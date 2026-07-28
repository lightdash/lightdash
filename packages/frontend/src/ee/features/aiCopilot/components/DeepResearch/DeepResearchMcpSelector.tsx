import { type AiMcpServer } from '@lightdash/common';
import { Alert, Checkbox, Group, Loader, Stack, Text } from '@mantine-8/core';
import { IconAlertCircle, IconPlugConnected } from '@tabler/icons-react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { isDeepResearchMcpServerReady } from '../../deepResearch/mcpServerReady';

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
    const availableMcpServers = mcpServers.filter(isDeepResearchMcpServerReady);

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
            ) : availableMcpServers.length > 0 ? (
                <Stack gap="xs">
                    {availableMcpServers.map((server) => (
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
                                </Group>
                            }
                        />
                    ))}
                </Stack>
            ) : (
                <Text size="11px" c="dimmed">
                    This agent has no MCP servers available.
                </Text>
            )}
        </Stack>
    );
};
