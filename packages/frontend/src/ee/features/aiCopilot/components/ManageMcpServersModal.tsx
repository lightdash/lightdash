import { type AiProjectMcpServer } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Group,
    Menu,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { IconDots, IconPencil, IconPlug, IconTrash } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import { useProject } from '../../../../hooks/useProject';
import {
    useDeleteAiMcpServerMutation,
    useProjectAiMcpServers,
    useRenameAiMcpServerMutation,
} from '../hooks/useProjectAiMcpServers';
import { AiMcpServerIcon } from './AiMcpServerIcon';
import styles from './ManageMcpServersModal.module.css';
import {
    getMcpAuthTypeLabel,
    getMcpConnectionStatusColor,
    getMcpConnectionStatusLabel,
    getMcpServerIconColor,
} from './mcpServerLabels';

const describeAgentCount = (count: number) =>
    count === 1 ? '1 agent' : `${count} agents`;

const formatAttachedAgents = (count: number) =>
    `Attached to ${describeAgentCount(count)}`;

type RenameInputProps = {
    initialName: string;
    onSubmit: (name: string) => void;
    onCancel: () => void;
};

const McpServerRenameInput: FC<RenameInputProps> = ({
    initialName,
    onSubmit,
    onCancel,
}) => {
    const [draft, setDraft] = useState(initialName);
    const [settled, setSettled] = useState(false);

    const settle = (action: () => void) => {
        if (settled) return;
        setSettled(true);
        action();
    };

    const commit = () => {
        const name = draft.trim();
        if (name.length === 0 || name === initialName) {
            settle(onCancel);
            return;
        }
        settle(() => onSubmit(name));
    };

    return (
        <TextInput
            size="xs"
            autoFocus
            aria-label="MCP server name"
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onFocus={(event) => event.currentTarget.select()}
            onBlur={commit}
            onKeyDown={(event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    commit();
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    settle(onCancel);
                }
            }}
        />
    );
};

type RowProps = {
    mcpServer: AiProjectMcpServer;
    isRenaming: boolean;
    onStartRename: () => void;
    onRename: (name: string) => void;
    onCancelRename: () => void;
    onDelete: () => void;
};

const McpServerRow: FC<RowProps> = ({
    mcpServer,
    isRenaming,
    onStartRename,
    onRename,
    onCancelRename,
    onDelete,
}) => (
    <Box className={styles.row}>
        <AiMcpServerIcon
            color={getMcpServerIconColor(mcpServer.connectionStatus)}
            name={mcpServer.name}
            size={32}
            src={mcpServer.iconUrl}
        />
        <Box className={styles.rowBody}>
            {isRenaming ? (
                <McpServerRenameInput
                    initialName={mcpServer.name}
                    onSubmit={onRename}
                    onCancel={onCancelRename}
                />
            ) : (
                <Text className={styles.rowTitle} truncate>
                    {mcpServer.name}
                </Text>
            )}
            <Text className={styles.rowMeta} truncate>
                {mcpServer.url}
            </Text>
            <Text className={styles.rowMeta}>
                {formatAttachedAgents(mcpServer.attachedAgentCount)}
            </Text>
        </Box>
        <Group gap="xs" wrap="nowrap">
            <Badge size="xs" variant="light" color="gray">
                {getMcpAuthTypeLabel(mcpServer.authType)}
            </Badge>
            <Badge
                size="xs"
                variant="light"
                color={getMcpConnectionStatusColor(mcpServer.connectionStatus)}
            >
                {getMcpConnectionStatusLabel(mcpServer)}
            </Badge>
            <Menu
                position="bottom-end"
                withArrow
                width={160}
                returnFocus={false}
            >
                <Menu.Target>
                    <ActionIcon
                        variant="subtle"
                        color="ldGray"
                        size="sm"
                        aria-label={`Actions for ${mcpServer.name}`}
                    >
                        <MantineIcon icon={IconDots} />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconPencil} />}
                        onClick={onStartRename}
                    >
                        Rename
                    </Menu.Item>
                    <Menu.Item
                        color="red"
                        leftSection={<MantineIcon icon={IconTrash} />}
                        onClick={onDelete}
                    >
                        Delete
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
        </Group>
    </Box>
);

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    onDeleted: (mcpServerUuid: string) => void;
};

export const ManageMcpServersModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    onDeleted,
}) => {
    const { data: project } = useProject(projectUuid);
    const {
        data: mcpServers,
        isLoading,
        isError,
    } = useProjectAiMcpServers(projectUuid, { enabled: opened });
    const { mutateAsync: renameMcpServer } =
        useRenameAiMcpServerMutation(projectUuid);
    const { mutateAsync: deleteMcpServer, isLoading: isDeleting } =
        useDeleteAiMcpServerMutation(projectUuid);
    const [renamingUuid, setRenamingUuid] = useState<string | null>(null);
    const [serverToDelete, setServerToDelete] =
        useState<AiProjectMcpServer | null>(null);

    const handleConfirmDelete = async () => {
        if (!serverToDelete) return;
        const { uuid } = serverToDelete;
        try {
            await deleteMcpServer(uuid);
        } catch {
            return;
        }
        setServerToDelete(null);
        onDeleted(uuid);
    };

    let content;
    if (isLoading) {
        content = (
            <Text size="sm" c="dimmed" ta="center" py="xl">
                Loading MCP servers…
            </Text>
        );
    } else if (isError) {
        content = (
            <Text size="sm" c="red" ta="center" py="xl">
                Failed to load MCP servers.
            </Text>
        );
    } else if (!mcpServers || mcpServers.length === 0) {
        content = (
            <Text size="sm" c="dimmed" ta="center" py="xl">
                No MCP servers in this project yet.
            </Text>
        );
    } else {
        content = (
            <Stack gap={2} className={styles.list}>
                {mcpServers.map((mcpServer) => (
                    <McpServerRow
                        key={mcpServer.uuid}
                        mcpServer={mcpServer}
                        isRenaming={renamingUuid === mcpServer.uuid}
                        onStartRename={() => setRenamingUuid(mcpServer.uuid)}
                        onCancelRename={() => setRenamingUuid(null)}
                        onRename={(name) => {
                            setRenamingUuid(null);
                            void renameMcpServer({
                                mcpServerUuid: mcpServer.uuid,
                                name,
                            });
                        }}
                        onDelete={() => setServerToDelete(mcpServer)}
                    />
                ))}
            </Stack>
        );
    }

    return (
        <>
            <MantineModal
                opened={opened}
                onClose={onClose}
                icon={IconPlug}
                size="48rem"
                title="MCP servers"
                subtitle={`Servers available to every agent in ${
                    project?.name ?? 'this project'
                }.`}
                modalBodyProps={{ px: 0, py: 0 }}
                bodyScrollAreaMaxHeight="60vh"
            >
                {content}
            </MantineModal>
            <MantineModal
                opened={serverToDelete !== null}
                onClose={() => setServerToDelete(null)}
                title="Delete MCP server"
                variant="delete"
                resourceType="MCP server"
                resourceLabel={serverToDelete?.name}
                description={
                    serverToDelete
                        ? `Deleting "${serverToDelete.name}" detaches it from ${describeAgentCount(
                              serverToDelete.attachedAgentCount,
                          )} and removes the shared sign-in and every user's personal sign-in. This cannot be undone.`
                        : undefined
                }
                onConfirm={handleConfirmDelete}
                confirmLoading={isDeleting}
            />
        </>
    );
};
