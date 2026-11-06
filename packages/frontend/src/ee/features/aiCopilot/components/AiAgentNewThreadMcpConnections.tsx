import {
    GITHUB_MCP_SERVER_NAME,
    interpolateUiString,
    type AiMcpCredentialScope,
    type AiMcpServer,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Paper,
    Popover,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconBrandGithub,
    IconCircleCheck,
    IconSparkles,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useUiStrings } from '../../../providers/Embed/useUiStrings';
import { useProjectUpdateAiAgentMutation } from '../hooks/useProjectAiAgents';
import {
    useAgentAiMcpServers,
    useConnectGithubMcpServerAppMutation,
    useConnectGithubMcpServerMutation,
    useGithubMcpAvailability,
    useStartMcpOAuthConnectionMutation,
} from '../hooks/useProjectAiMcpServers';
import styles from './AiAgentNewThreadMcpConnections.module.css';
import { AiMcpServerIcon } from './AiMcpServerIcon';
import { GithubMcpConnectModal } from './GithubMcpConnectModal';
import {
    GITHUB_MCP_CONNECTED_HEADLINE,
    GITHUB_MCP_CONNECTED_SUMMARY,
    GITHUB_MCP_SUGGESTED_PROMPT,
    GITHUB_MCP_VALUE_SUMMARY,
} from './githubMcpValueContent';

const needsPersonalOauthConnection = (
    mcpServer: Pick<
        AiMcpServer,
        'authType' | 'connectionStatus' | 'credentialScope'
    >,
) =>
    mcpServer.authType === 'oauth' &&
    (mcpServer.connectionStatus !== 'connected' ||
        mcpServer.credentialScope === 'shared');

const getConnectionNote = (
    mcpServer: Pick<AiMcpServer, 'connectionStatus' | 'credentialScope'>,
) => {
    if (
        mcpServer.connectionStatus === 'connected' &&
        mcpServer.credentialScope === 'shared'
    ) {
        return 'Some tools are using a shared project connection. Connect your own account if you want to use your personal access.';
    }

    if (mcpServer.connectionStatus === 'error') {
        return 'One or more sign-ins did not finish. Reconnect to use those tools.';
    }

    if (mcpServer.connectionStatus === 'connecting') {
        return 'Finish the sign-in window to keep going.';
    }

    return null;
};

const formatAppNames = (names: string[]) => {
    if (names.length === 0) return '';
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;

    return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
};

const getConnectionSummary = (appNames: string[]) => {
    if (appNames.length === 1) {
        return `This agent can use ${appNames[0]} if you connect it.`;
    }

    return `This agent can use ${formatAppNames(
        appNames,
    )}. Connect the apps you want to use in this thread.`;
};

const getConnectionIconColor = (
    mcpServer: Pick<AiMcpServer, 'connectionStatus' | 'credentialScope'>,
) => {
    if (
        mcpServer.connectionStatus === 'connected' &&
        mcpServer.credentialScope === 'shared'
    ) {
        return 'blue' as const;
    }

    if (mcpServer.connectionStatus === 'error') {
        return 'red' as const;
    }

    if (mcpServer.connectionStatus === 'connecting') {
        return 'blue' as const;
    }

    return 'gray' as const;
};

type AppRow = {
    key: string;
    name: string;
    icon: ReactNode;
    action: { label: string; loading: boolean; onClick: () => void };
};

type Props = {
    projectUuid: string;
    agentUuid: string;
    onSuggestedPrompt?: (prompt: string) => void;
};

/** `tray` tucks the row under the composer card; `standalone` is a centered line. */
export const AiAgentNewThreadMcpConnections: FC<
    Props & { placement: 'tray' | 'standalone' }
> = ({ placement, ...props }) =>
    placement === 'tray' ? (
        <Box className={styles.tray}>
            <McpConnections {...props} />
        </Box>
    ) : (
        <McpConnections {...props} />
    );

const McpConnections: FC<Props> = ({
    projectUuid,
    agentUuid,
    onSuggestedPrompt,
}) => {
    const getUiString = useUiStrings();
    const [isAppsPopoverOpen, appsPopoverHandlers] = useDisclosure(false);
    const [justConnectedGithub, setJustConnectedGithub] = useState(false);
    const {
        data: mcpServers,
        isLoading,
        refetch: refetchAgentMcpServers,
    } = useAgentAiMcpServers(projectUuid, agentUuid, {
        enabled: !!projectUuid && !!agentUuid,
    });
    const {
        mutateAsync: startMcpOAuthConnection,
        isLoading: isStartingMcpOAuthConnection,
        variables: startingMcpOAuthConnection,
    } = useStartMcpOAuthConnectionMutation(projectUuid);
    const { data: githubMcpAvailability } = useGithubMcpAvailability(
        projectUuid,
        { enabled: !!projectUuid },
    );
    const { mutateAsync: connectGithubMcp, isLoading: isConnectingGithubMcp } =
        useConnectGithubMcpServerMutation(projectUuid);
    const {
        mutateAsync: connectGithubMcpApp,
        isLoading: isConnectingGithubMcpApp,
    } = useConnectGithubMcpServerAppMutation(projectUuid);
    const { mutateAsync: updateAgentMcpServers, isLoading: isAttachingGithub } =
        useProjectUpdateAiAgentMutation(projectUuid, {
            showSuccessToast: false,
        });
    const [isGithubConfirmModalOpen, githubConfirmModalHandlers] =
        useDisclosure(false);

    const mcpServersNeedingConnection = useMemo(
        () =>
            (mcpServers ?? []).filter((mcpServer) =>
                needsPersonalOauthConnection(mcpServer),
            ),
        [mcpServers],
    );
    const githubConnectModes = githubMcpAvailability?.availableModes ?? [];
    const canGithubAppConnect = githubConnectModes.includes('github_app');
    const canOneClickConnectGithub =
        githubConnectModes.length > 0 &&
        githubMcpAvailability?.alreadyConnected === false;

    const appNames = useMemo(() => {
        const oauthAppNames = Array.from(
            new Set(
                mcpServersNeedingConnection.map((mcpServer) => mcpServer.name),
            ),
        );
        return canOneClickConnectGithub
            ? [...oauthAppNames, GITHUB_MCP_SERVER_NAME]
            : oauthAppNames;
    }, [mcpServersNeedingConnection, canOneClickConnectGithub]);

    const connectionNote = useMemo(() => {
        for (const mcpServer of mcpServersNeedingConnection) {
            const note = getConnectionNote(mcpServer);
            if (note) return note;
        }

        return null;
    }, [mcpServersNeedingConnection]);

    const handleStartConnection = useCallback(
        async (mcpServerUuid: string) => {
            try {
                await startMcpOAuthConnection({
                    mcpServerUuid,
                });
            } catch {
                // Toasts are handled in the mutation.
            } finally {
                await refetchAgentMcpServers();
            }
        },
        [refetchAgentMcpServers, startMcpOAuthConnection],
    );

    const attachGithubMcpServer = useCallback(
        async (server: Pick<AiMcpServer, 'uuid'>) => {
            const attachedUuids = (mcpServers ?? []).map(
                (mcpServer) => mcpServer.uuid,
            );
            if (!attachedUuids.includes(server.uuid)) {
                await updateAgentMcpServers({
                    uuid: agentUuid,
                    mcpServerUuids: [...attachedUuids, server.uuid],
                });
            }
            githubConfirmModalHandlers.close();
            setJustConnectedGithub(true);
        },
        [
            agentUuid,
            githubConfirmModalHandlers,
            mcpServers,
            updateAgentMcpServers,
        ],
    );

    const handleConnectGithubMcp = useCallback(
        async (
            personalAccessToken: string,
            credentialScope: AiMcpCredentialScope,
        ) => {
            try {
                const server = await connectGithubMcp({
                    personalAccessToken,
                    credentialScope,
                });
                if (!server) {
                    return;
                }
                await attachGithubMcpServer(server);
            } catch {
            } finally {
                await refetchAgentMcpServers();
            }
        },
        [attachGithubMcpServer, connectGithubMcp, refetchAgentMcpServers],
    );

    const handleConnectGithubMcpApp = useCallback(async () => {
        try {
            const server = await connectGithubMcpApp();
            if (!server) {
                return;
            }
            await attachGithubMcpServer(server);
        } catch {
            // Errors surface via the mutation's onError toast.
        } finally {
            await refetchAgentMcpServers();
        }
    }, [attachGithubMcpServer, connectGithubMcpApp, refetchAgentMcpServers]);

    if (isLoading) return null;

    if (justConnectedGithub) {
        return (
            <Paper
                radius="md"
                p="md"
                component="section"
                aria-label={GITHUB_MCP_CONNECTED_HEADLINE}
            >
                <Group align="flex-start" gap="sm" wrap="nowrap">
                    <Paper p="xxs" radius="sm">
                        <MantineIcon
                            icon={IconCircleCheck}
                            size="sm"
                            color="var(--mantine-color-green-6)"
                        />
                    </Paper>
                    <Stack gap="xs" flex={1} miw={0}>
                        <Stack gap={2}>
                            <Text size="sm" fw={600}>
                                {GITHUB_MCP_CONNECTED_HEADLINE}
                            </Text>
                            <Text size="sm" c="dimmed">
                                {GITHUB_MCP_CONNECTED_SUMMARY}
                            </Text>
                        </Stack>
                        {onSuggestedPrompt && (
                            <Group gap="xs">
                                <Button
                                    size="xs"
                                    variant="default"
                                    leftSection={
                                        <MantineIcon icon={IconSparkles} />
                                    }
                                    onClick={() => {
                                        onSuggestedPrompt(
                                            GITHUB_MCP_SUGGESTED_PROMPT,
                                        );
                                        setJustConnectedGithub(false);
                                    }}
                                >
                                    {GITHUB_MCP_SUGGESTED_PROMPT}
                                </Button>
                                <Button
                                    size="xs"
                                    variant="subtle"
                                    color="gray"
                                    onClick={() =>
                                        setJustConnectedGithub(false)
                                    }
                                >
                                    Dismiss
                                </Button>
                            </Group>
                        )}
                    </Stack>
                </Group>
            </Paper>
        );
    }

    if (mcpServersNeedingConnection.length === 0 && !canOneClickConnectGithub) {
        return null;
    }

    const isGithubOnly =
        canOneClickConnectGithub && mcpServersNeedingConnection.length === 0;
    const sectionSummary = isGithubOnly
        ? GITHUB_MCP_VALUE_SUMMARY
        : getConnectionSummary(appNames);
    const isConnectingGithub =
        isConnectingGithubMcp || isConnectingGithubMcpApp || isAttachingGithub;

    const appRows: AppRow[] = [
        ...mcpServersNeedingConnection.map((mcpServer): AppRow => {
            return {
                key: mcpServer.uuid,
                name: mcpServer.name,
                icon: (
                    <AiMcpServerIcon
                        color={getConnectionIconColor(mcpServer)}
                        name={mcpServer.name}
                        size={18}
                        src={mcpServer.iconUrl}
                    />
                ),
                action: {
                    label: getUiString('aiAgent.mcpApps.signIn'),
                    loading:
                        isStartingMcpOAuthConnection &&
                        startingMcpOAuthConnection?.mcpServerUuid ===
                            mcpServer.uuid,
                    onClick: () => void handleStartConnection(mcpServer.uuid),
                },
            };
        }),
        ...(canOneClickConnectGithub
            ? [
                  {
                      key: 'github-connect',
                      name: GITHUB_MCP_SERVER_NAME,
                      icon: <MantineIcon icon={IconBrandGithub} size={18} />,
                      action: {
                          label: getUiString('aiAgent.mcpApps.connect'),
                          loading: isConnectingGithub,
                          onClick: canGithubAppConnect
                              ? () => void handleConnectGithubMcpApp()
                              : () => {
                                    appsPopoverHandlers.close();
                                    githubConfirmModalHandlers.open();
                                },
                      },
                  },
              ]
            : []),
    ];
    const availableLabel = interpolateUiString(
        getUiString(
            appRows.length === 1
                ? 'aiAgent.mcpApps.available.singular'
                : 'aiAgent.mcpApps.available.plural',
        ),
        { count: appRows.length },
    );

    return (
        <Box
            className={styles.connectionStrip}
            component="section"
            aria-label={availableLabel}
            aria-busy={isStartingMcpOAuthConnection || isConnectingGithub}
        >
            <Popover
                opened={isAppsPopoverOpen}
                onChange={(opened) =>
                    opened
                        ? appsPopoverHandlers.open()
                        : appsPopoverHandlers.close()
                }
                position="top"
                width={320}
                trapFocus
                returnFocus
                withinPortal
            >
                <Popover.Target>
                    <UnstyledButton
                        className={styles.connectionLine}
                        aria-haspopup="dialog"
                        aria-expanded={isAppsPopoverOpen}
                        onClick={appsPopoverHandlers.toggle}
                    >
                        <Group gap={4} wrap="nowrap" aria-hidden>
                            {appRows.map((row) => (
                                <Box key={row.key} className={styles.lineIcon}>
                                    {row.icon}
                                </Box>
                            ))}
                        </Group>
                        <Text component="span" fz="sm" c="dimmed">
                            {availableLabel}
                        </Text>
                    </UnstyledButton>
                </Popover.Target>
                <Popover.Dropdown p="xs">
                    <Stack gap="xs">
                        <Stack gap={2} px={6} pt={2}>
                            <Text size="xs" c="dimmed">
                                {sectionSummary}
                            </Text>
                            {connectionNote && (
                                <Text size="xs" c="dimmed">
                                    {connectionNote}
                                </Text>
                            )}
                        </Stack>
                        <Stack gap={2}>
                            {appRows.map((row) => (
                                <Group
                                    key={row.key}
                                    gap="xs"
                                    wrap="nowrap"
                                    className={styles.appRow}
                                >
                                    <Box className={styles.lineIcon}>
                                        {row.icon}
                                    </Box>
                                    <Text fz="sm" flex={1} miw={0} truncate>
                                        {row.name}
                                    </Text>
                                    <Button
                                        size="compact-xs"
                                        variant="default"
                                        loading={row.action.loading}
                                        onClick={row.action.onClick}
                                        aria-label={interpolateUiString(
                                            getUiString(
                                                'aiAgent.mcpApps.actionFor',
                                            ),
                                            {
                                                action: row.action.label,
                                                app: row.name,
                                            },
                                        )}
                                    >
                                        {row.action.label}
                                    </Button>
                                </Group>
                            ))}
                        </Stack>
                    </Stack>
                </Popover.Dropdown>
            </Popover>
            <GithubMcpConnectModal
                opened={isGithubConfirmModalOpen}
                onClose={githubConfirmModalHandlers.close}
                isLoading={isConnectingGithubMcp || isAttachingGithub}
                onConnect={handleConnectGithubMcp}
            />
        </Box>
    );
};
