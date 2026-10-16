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
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('aiAgent');
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
            aria-label={t('manageMcp.serverName')}
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
}) => {
    const { t } = useTranslation('aiAgent');
    return (
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
                    {t('manageMcp.attachedTo', {
                        count: mcpServer.attachedAgentCount,
                    })}
                </Text>
            </Box>
            <Group gap="xs" wrap="nowrap">
                <Badge size="xs" variant="light" color="gray">
                    {getMcpAuthTypeLabel(mcpServer.authType)}
                </Badge>
                <Badge
                    size="xs"
                    variant="light"
                    color={getMcpConnectionStatusColor(
                        mcpServer.connectionStatus,
                    )}
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
                            aria-label={t('manageMcp.actionsFor', {
                                name: mcpServer.name,
                            })}
                        >
                            <MantineIcon icon={IconDots} />
                        </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconPencil} />}
                            onClick={onStartRename}
                        >
                            {t('sidebar.rename')}
                        </Menu.Item>
                        <Menu.Item
                            color="red"
                            leftSection={<MantineIcon icon={IconTrash} />}
                            onClick={onDelete}
                        >
                            {t('actions.delete', { ns: 'common' })}
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            </Group>
        </Box>
    );
};

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
    const { t } = useTranslation('aiAgent');
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
                {t('manageMcp.loading')}
            </Text>
        );
    } else if (isError) {
        content = (
            <Text size="sm" c="red" ta="center" py="xl">
                {t('manageMcp.loadFailed')}
            </Text>
        );
    } else if (!mcpServers || mcpServers.length === 0) {
        content = (
            <Text size="sm" c="dimmed" ta="center" py="xl">
                {t('manageMcp.empty')}
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
                title={t('mcpInput.section.title')}
                subtitle={
                    project?.name
                        ? t('manageMcp.subtitle', { project: project.name })
                        : t('manageMcp.subtitleThisProject')
                }
                modalBodyProps={{ px: 0, py: 0 }}
                bodyScrollAreaMaxHeight="60vh"
            >
                {content}
            </MantineModal>
            <MantineModal
                opened={serverToDelete !== null}
                onClose={() => setServerToDelete(null)}
                title={t('manageMcp.deleteTitle')}
                variant="delete"
                resourceType={t('manageMcp.resourceType')}
                resourceLabel={serverToDelete?.name}
                description={
                    serverToDelete
                        ? t('manageMcp.deleteDescription', {
                              name: serverToDelete.name,
                              count: serverToDelete.attachedAgentCount,
                          })
                        : undefined
                }
                onConfirm={handleConfirmDelete}
                confirmLoading={isDeleting}
            />
        </>
    );
};
