import { type AiMcpServer } from '@lightdash/common';
import {
    Alert,
    Group,
    Loader,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine-8/core';
import {
    IconAlertCircle,
    IconCheck,
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

    return isLoading ? (
        <Group gap="xs">
            <Loader size="xs" />
            <Text size="xs" c="dimmed">
                Checking MCP connections…
            </Text>
        </Group>
    ) : error ? (
        <Alert color="red" icon={<MantineIcon icon={IconAlertCircle} />} p="xs">
            {error}
        </Alert>
    ) : availableMcpServers.length > 0 ? (
        <Stack gap={2}>
            {availableMcpServers.map((server) => {
                const isSelected = selectedMcpServerUuids.includes(server.uuid);
                return (
                    <UnstyledButton
                        key={server.uuid}
                        className={styles.listOption}
                        onClick={() =>
                            handleServerChange(server.uuid, !isSelected)
                        }
                        role="checkbox"
                        aria-checked={isSelected}
                        aria-label={server.name}
                    >
                        <Group justify="space-between" wrap="nowrap">
                            <Group gap={6}>
                                <MantineIcon
                                    icon={IconPlugConnected}
                                    size={13}
                                />
                                <Text span size="sm">
                                    {server.name}
                                </Text>
                            </Group>
                            {isSelected && (
                                <MantineIcon
                                    icon={IconCheck}
                                    size="sm"
                                    color="ldGray.7"
                                />
                            )}
                        </Group>
                    </UnstyledButton>
                );
            })}
        </Stack>
    ) : (
        <Text size="xs" c="dimmed">
            No MCP sources available.
        </Text>
    );
};
