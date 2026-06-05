import {
    GITHUB_MCP_SERVER_NAME,
    type AiMcpCredentialScope,
    type AiMcpServer,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Paper,
    Skeleton,
    Stack,
    Text,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import {
    IconBrandGithub,
    IconCircleCheck,
    IconInfoCircle,
    IconSparkles,
} from '@tabler/icons-react';
import { useCallback, useId, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useProjectUpdateAiAgentMutation } from '../hooks/useProjectAiAgents';
import {
    useAgentAiMcpServers,
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

const getConnectionActionLabel = (
    mcpServer: Pick<
        AiMcpServer,
        'name' | 'connectionStatus' | 'credentialScope'
    >,
) => {
    if (
        mcpServer.connectionStatus === 'connected' &&
        mcpServer.credentialScope === 'shared'
    ) {
        return 'Sign in';
    }

    if (mcpServer.connectionStatus === 'error') {
        return 'Sign in';
    }

    return 'Sign in';
};

const getMultiAppConnectionActionLabel = (
    mcpServer: Pick<AiMcpServer, 'name'>,
) => `Sign in to ${mcpServer.name}`;

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

type Props = {
    projectUuid: string;
    agentUuid: string;
    onSuggestedPrompt?: (prompt: string) => void;
};

export const AiAgentNewThreadMcpConnections: FC<Props> = ({
    projectUuid,
    agentUuid,
    onSuggestedPrompt,
}) => {
    const sectionTitleId = useId();
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
    const canOneClickConnectGithub =
        githubMcpAvailability?.available === true &&
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
            } catch {
            } finally {
                await refetchAgentMcpServers();
            }
        },
        [
            agentUuid,
            connectGithubMcp,
            githubConfirmModalHandlers,
            mcpServers,
            refetchAgentMcpServers,
            updateAgentMcpServers,
        ],
    );

    if (isLoading) {
        return (
            <Box
                className={styles.connectionStrip}
                component="section"
                aria-label="Loading tools to connect"
                aria-busy="true"
            >
                <Skeleton h={24} w={260} radius="xl" />
            </Box>
        );
    }

    if (justConnectedGithub) {
        return (
            <Paper
                withBorder
                radius="md"
                p="md"
                component="section"
                aria-label={GITHUB_MCP_CONNECTED_HEADLINE}
            >
                <Group align="flex-start" gap="sm" wrap="nowrap">
                    <Paper p="xxs" withBorder radius="sm">
                        <MantineIcon
                            icon={IconCircleCheck}
                            size="sm"
                            color="var(--mantine-color-green-6)"
                        />
                    </Paper>
                    <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
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

    const githubConnectButton = canOneClickConnectGithub ? (
        <Button
            key="github-connect"
            size="compact-xs"
            variant="subtle"
            color="gray"
            leftSection={<MantineIcon icon={IconBrandGithub} />}
            loading={isConnectingGithubMcp || isAttachingGithub}
            onClick={githubConfirmModalHandlers.open}
        >
            GitHub
        </Button>
    ) : null;

    const isSingleApp = appNames.length === 1;

    return (
        <Box
            className={styles.connectionStrip}
            component="section"
            aria-labelledby={sectionTitleId}
            aria-busy={isStartingMcpOAuthConnection}
        >
            {isSingleApp ? (
                <Group justify="center" align="center" gap="xs" wrap="wrap">
                    <Group
                        align="center"
                        gap={6}
                        className={styles.connectionCopy}
                    >
                        <MantineIcon
                            icon={IconInfoCircle}
                            size={13}
                            color="ldGray.5"
                        />
                        <Text id={sectionTitleId} size="xs" c="ldGray.6">
                            {sectionSummary}
                        </Text>
                        {connectionNote && (
                            <Text size="xs" c="ldGray.5">
                                {connectionNote}
                            </Text>
                        )}
                    </Group>
                    {mcpServersNeedingConnection.map((mcpServer) => {
                        const isConnecting =
                            isStartingMcpOAuthConnection &&
                            startingMcpOAuthConnection?.mcpServerUuid ===
                                mcpServer.uuid;
                        const iconColor = getConnectionIconColor(mcpServer);

                        return (
                            <Button
                                key={mcpServer.uuid}
                                size="compact-xs"
                                variant="subtle"
                                color="gray"
                                leftSection={
                                    <AiMcpServerIcon
                                        color={iconColor}
                                        name={mcpServer.name}
                                        size={16}
                                        src={mcpServer.iconUrl}
                                    />
                                }
                                loading={isConnecting}
                                onClick={() =>
                                    void handleStartConnection(mcpServer.uuid)
                                }
                            >
                                {getConnectionActionLabel(mcpServer)}
                            </Button>
                        );
                    })}
                    {githubConnectButton}
                </Group>
            ) : (
                <Stack gap={4} align="center">
                    <Group gap={6} justify="center" wrap="wrap">
                        <MantineIcon
                            icon={IconInfoCircle}
                            size={13}
                            color="ldGray.5"
                        />
                        <Text id={sectionTitleId} size="xs" c="ldGray.6">
                            {sectionSummary}
                        </Text>
                        {connectionNote && (
                            <Text size="xs" c="ldGray.5">
                                {connectionNote}
                            </Text>
                        )}
                    </Group>
                    <Group gap={4} justify="center">
                        {mcpServersNeedingConnection.map((mcpServer) => {
                            const isConnecting =
                                isStartingMcpOAuthConnection &&
                                startingMcpOAuthConnection?.mcpServerUuid ===
                                    mcpServer.uuid;
                            const iconColor = getConnectionIconColor(mcpServer);

                            return (
                                <Button
                                    key={mcpServer.uuid}
                                    size="compact-xs"
                                    variant="subtle"
                                    color="gray"
                                    leftSection={
                                        <AiMcpServerIcon
                                            color={iconColor}
                                            name={mcpServer.name}
                                            size={16}
                                            src={mcpServer.iconUrl}
                                        />
                                    }
                                    loading={isConnecting}
                                    onClick={() =>
                                        void handleStartConnection(
                                            mcpServer.uuid,
                                        )
                                    }
                                >
                                    {getMultiAppConnectionActionLabel(
                                        mcpServer,
                                    )}
                                </Button>
                            );
                        })}
                        {githubConnectButton}
                    </Group>
                </Stack>
            )}
            <GithubMcpConnectModal
                opened={isGithubConfirmModalOpen}
                onClose={githubConfirmModalHandlers.close}
                isLoading={isConnectingGithubMcp || isAttachingGithub}
                onConnect={handleConnectGithubMcp}
            />
        </Box>
    );
};
