import type { AiMcpServer } from '@lightdash/ai';
import {
    ActionIcon,
    Box,
    Button,
    Checkbox,
    Group,
    Stack,
    Text,
    useMantineColorScheme,
} from '@mantine-8/core';
import {
    IconInfoCircle,
    IconPlugConnected,
    IconRefresh,
    IconTools,
} from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { useEffect, useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import {
    rehypeRemoveHeaderLinks,
    useMdEditorStyle,
} from '../../../../utils/markdownUtils';
import {
    useAgentAiMcpServerTools,
    useRefreshAiMcpServerToolsMutation,
    useStartMcpOAuthConnectionMutation,
    useUpdateAgentAiMcpServerToolsMutation,
} from '../hooks/useProjectAiMcpServers';

type Props = {
    agentUuid?: string;
    projectUuid: string;
    mcpServer: AiMcpServer;
    isPersistedAttachment: boolean;
    isSavingAgent?: boolean;
    opened: boolean;
    showHeader?: boolean;
};

const shouldBlockTools = (mcpServer: AiMcpServer) =>
    mcpServer.authType === 'oauth' &&
    mcpServer.connectionStatus !== 'connected';

const getConnectionRequiredCopy = (mcpServer: AiMcpServer) => {
    if (mcpServer.connectionStatus === 'error') {
        return {
            message: 'Reconnect to load and configure tools.',
            actionLabel: 'Reconnect',
        };
    }

    return {
        message: 'Connect your account to load tools.',
        actionLabel: 'Connect account',
    };
};

const ToolDescriptionModal = ({
    opened,
    onClose,
    title,
    toolName,
    source,
}: {
    opened: boolean;
    onClose: () => void;
    title: string;
    toolName: string;
    source: string;
}) => {
    const { colorScheme } = useMantineColorScheme();
    const markdownStyle = useMdEditorStyle();

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={title}
            size="lg"
            icon={IconTools}
            cancelLabel={false}
            actions={false}
        >
            <Stack gap="md">
                <Box>
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                        Tool name
                    </Text>
                    <Text size="sm">{toolName}</Text>
                </Box>
                <Box>
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb="xs">
                        Description
                    </Text>
                    <Box data-color-mode={colorScheme}>
                        <MarkdownPreview
                            source={source}
                            rehypeRewrite={rehypeRemoveHeaderLinks}
                            style={{
                                ...markdownStyle,
                                color: 'var(--mantine-color-text)',
                            }}
                            components={{
                                p: ({ children }) => (
                                    <p style={{ margin: 0, fontWeight: 400 }}>
                                        {children}
                                    </p>
                                ),
                                ul: ({ children }) => (
                                    <ul
                                        style={{
                                            margin: '4px 0 0',
                                            paddingLeft: 18,
                                        }}
                                    >
                                        {children}
                                    </ul>
                                ),
                                ol: ({ children }) => (
                                    <ol
                                        style={{
                                            margin: '4px 0 0',
                                            paddingLeft: 18,
                                        }}
                                    >
                                        {children}
                                    </ol>
                                ),
                            }}
                        />
                    </Box>
                </Box>
            </Stack>
        </MantineModal>
    );
};

export const AiAgentMcpServerToolsPanel: FC<Props> = ({
    agentUuid,
    projectUuid,
    mcpServer,
    isPersistedAttachment,
    isSavingAgent = false,
    opened,
    showHeader = true,
}) => {
    const [hasRequestedInitialRefresh, setHasRequestedInitialRefresh] =
        useState(false);
    const [selectedToolForDescription, setSelectedToolForDescription] =
        useState<{
            title: string;
            toolName: string;
            description: string;
        } | null>(null);
    const canConfigureTools =
        !!agentUuid && isPersistedAttachment && !isSavingAgent;
    const isConnectionRequired = shouldBlockTools(mcpServer);

    const toolsQuery = useAgentAiMcpServerTools(
        projectUuid,
        agentUuid,
        mcpServer.uuid,
        {
            enabled: canConfigureTools && opened,
        },
    );

    const { mutateAsync: refreshTools, isLoading: isRefreshingTools } =
        useRefreshAiMcpServerToolsMutation(projectUuid);
    const {
        mutateAsync: startMcpOAuthConnection,
        isLoading: isStartingMcpOAuthConnection,
    } = useStartMcpOAuthConnectionMutation(projectUuid);
    const {
        mutateAsync: updateTools,
        isLoading: isUpdatingTools,
        variables: updateVariables,
    } = useUpdateAgentAiMcpServerToolsMutation(
        projectUuid,
        agentUuid ?? '',
        mcpServer.uuid,
    );

    const tools = toolsQuery.data ?? [];

    useEffect(() => {
        if (
            !canConfigureTools ||
            !opened ||
            isConnectionRequired ||
            hasRequestedInitialRefresh ||
            isRefreshingTools ||
            toolsQuery.isLoading ||
            tools.length > 0
        ) {
            return;
        }

        setHasRequestedInitialRefresh(true);
        void refreshTools({
            mcpServerUuid: mcpServer.uuid,
            agentUuid,
            showSuccessToast: false,
        });
    }, [
        agentUuid,
        canConfigureTools,
        hasRequestedInitialRefresh,
        isConnectionRequired,
        isRefreshingTools,
        mcpServer.uuid,
        opened,
        refreshTools,
        tools.length,
        toolsQuery.isLoading,
    ]);

    if (!agentUuid) {
        return (
            <Box py="sm">
                <Text size="sm" c="dimmed">
                    Create this agent before configuring MCP tools.
                </Text>
            </Box>
        );
    }

    if (!isPersistedAttachment) {
        return (
            <Box py="sm">
                <Text size="sm" c="dimmed">
                    Saving MCP settings...
                </Text>
            </Box>
        );
    }

    if (isSavingAgent) {
        return null;
    }

    if (isConnectionRequired) {
        if (mcpServer.connectionStatus === 'connecting') {
            return null;
        }

        const connectionRequiredCopy = getConnectionRequiredCopy(mcpServer);

        return (
            <Box py="sm">
                <Group justify="space-between" align="center" gap="sm">
                    <Text size="sm" c="dimmed">
                        {connectionRequiredCopy.message}
                    </Text>
                    <Button
                        size="compact-xs"
                        variant="default"
                        leftSection={
                            <MantineIcon icon={IconPlugConnected} size="sm" />
                        }
                        loading={isStartingMcpOAuthConnection}
                        onClick={() =>
                            void startMcpOAuthConnection({
                                mcpServerUuid: mcpServer.uuid,
                            })
                        }
                    >
                        {connectionRequiredCopy.actionLabel}
                    </Button>
                </Group>
            </Box>
        );
    }

    const enabledCount = tools.filter((tool) => tool.enabled).length;
    const allToolsEnabled = tools.length > 0 && enabledCount === tools.length;
    const hasMixedToolSelection =
        enabledCount > 0 && enabledCount < tools.length;
    const isInitialLoading = toolsQuery.isLoading && tools.length === 0;

    return (
        <Box py="sm">
            <Stack gap="md">
                <Stack gap={2}>
                    <Group justify="space-between" gap="sm" align="center">
                        {showHeader ? (
                            <Group gap="xs">
                                <MantineIcon
                                    icon={IconTools}
                                    color="var(--mantine-color-ldGray-7)"
                                />
                                <Text size="sm" fw={600}>
                                    Tools
                                </Text>
                                {!isInitialLoading && tools.length > 0 && (
                                    <Text size="xs" c="dimmed">
                                        {enabledCount}/{tools.length} enabled
                                    </Text>
                                )}
                            </Group>
                        ) : (
                            <Text size="xs" c="dimmed">
                                Changes save automatically.
                            </Text>
                        )}
                        <Group gap={4}>
                            <Button
                                variant="subtle"
                                size="compact-xs"
                                leftSection={
                                    <MantineIcon icon={IconRefresh} size="sm" />
                                }
                                loading={isRefreshingTools}
                                onClick={() =>
                                    refreshTools({
                                        mcpServerUuid: mcpServer.uuid,
                                        agentUuid,
                                        showSuccessToast: true,
                                    })
                                }
                            >
                                Refresh tools from this MCP
                            </Button>
                        </Group>
                    </Group>
                    {showHeader && (
                        <Text size="xs" c="dimmed">
                            Changes save automatically.
                        </Text>
                    )}
                </Stack>

                {isInitialLoading ? (
                    <Group gap="xs">
                        <Text size="sm" c="dimmed">
                            Loading tools...
                        </Text>
                    </Group>
                ) : tools.length === 0 ? (
                    <Text size="sm" c="dimmed">
                        No tools found for this MCP server yet.
                    </Text>
                ) : (
                    <Stack gap="xs">
                        <Checkbox
                            label={
                                <Text size="sm" fw={600} c="ldGray.9">
                                    Enable all
                                </Text>
                            }
                            checked={allToolsEnabled}
                            indeterminate={hasMixedToolSelection}
                            disabled={isRefreshingTools || isUpdatingTools}
                            onChange={(event) =>
                                void updateTools({
                                    toolSettings: tools.map((tool) => ({
                                        toolName: tool.toolName,
                                        enabled: event.currentTarget.checked,
                                    })),
                                })
                            }
                        />
                        {tools.map((tool) => {
                            const isUpdating =
                                isUpdatingTools &&
                                (updateVariables?.toolSettings.some(
                                    (setting) =>
                                        setting.toolName === tool.toolName,
                                ) ??
                                    false);
                            const checkboxId = `mcp-tool-${tool.uuid}`;

                            return (
                                <Box key={tool.uuid} py={2} pl="lg">
                                    <Group
                                        align="center"
                                        gap="xs"
                                        wrap="nowrap"
                                    >
                                        <Checkbox
                                            id={checkboxId}
                                            checked={tool.enabled}
                                            disabled={isUpdating}
                                            aria-label={`Toggle ${tool.title || tool.toolName}`}
                                            onChange={(event) =>
                                                void updateTools({
                                                    toolSettings: [
                                                        {
                                                            toolName:
                                                                tool.toolName,
                                                            enabled:
                                                                event
                                                                    .currentTarget
                                                                    .checked,
                                                        },
                                                    ],
                                                })
                                            }
                                        />
                                        <Box flex={1}>
                                            <Group gap={6} wrap="nowrap">
                                                <Text
                                                    component="label"
                                                    htmlFor={checkboxId}
                                                    size="sm"
                                                    fw={700}
                                                    c="ldGray.9"
                                                    style={{
                                                        cursor: isUpdating
                                                            ? 'not-allowed'
                                                            : 'pointer',
                                                    }}
                                                >
                                                    {tool.title ||
                                                        tool.toolName}
                                                </Text>
                                                <ActionIcon
                                                    variant="subtle"
                                                    color="gray"
                                                    size="sm"
                                                    aria-label={`View description for ${tool.title || tool.toolName}`}
                                                    onClick={() =>
                                                        setSelectedToolForDescription(
                                                            {
                                                                title:
                                                                    tool.title ||
                                                                    tool.toolName,
                                                                toolName:
                                                                    tool.toolName,
                                                                description:
                                                                    tool.description ||
                                                                    'No description provided',
                                                            },
                                                        )
                                                    }
                                                >
                                                    <MantineIcon
                                                        icon={IconInfoCircle}
                                                        size="sm"
                                                    />
                                                </ActionIcon>
                                            </Group>
                                        </Box>
                                    </Group>
                                </Box>
                            );
                        })}
                    </Stack>
                )}
            </Stack>
            <ToolDescriptionModal
                opened={!!selectedToolForDescription}
                onClose={() => setSelectedToolForDescription(null)}
                title={selectedToolForDescription?.title ?? 'Tool description'}
                toolName={selectedToolForDescription?.toolName ?? ''}
                source={
                    selectedToolForDescription?.description ??
                    'No description provided'
                }
            />
        </Box>
    );
};
