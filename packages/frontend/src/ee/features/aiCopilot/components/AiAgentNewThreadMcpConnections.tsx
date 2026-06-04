import {
    GITHUB_MCP_SERVER_NAME,
    type AiMcpCredentialScope,
    type AiMcpServer,
} from '@lightdash/common';
import { Button, Group, Paper, Skeleton, Stack, Text } from '@mantine-8/core';
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
import { AiMcpServerIcon } from './AiMcpServerIcon';
import { GithubMcpConnectModal } from './GithubMcpConnectModal';
import {
    GITHUB_MCP_CONNECTED_HEADLINE,
    GITHUB_MCP_CONNECTED_SUMMARY,
    GITHUB_MCP_SUGGESTED_PROMPT,
    GITHUB_MCP_VALUE_HEADLINE,
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

const getConnectionTitle = (appNames: string[]) => {
    if (appNames.length === 1) {
        return `${appNames[0]} is available`;
    }

    return 'Connect your apps';
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
    // When provided, the post-connect success state offers a one-click prompt
    // that seeds the message composer (the activation moment).
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
    // GitHub uses a PAT (bearer auth), so it never appears in
    // mcpServersNeedingConnection (that list is OAuth-only). Offer the one-click
    // connect when GitHub is available and the current user doesn't already have
    // a usable credential — `alreadyConnected` is per-user, so each user is
    // prompted to connect their own token on a per-user GitHub server.
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
                // connect is idempotent server-side — creates the bearer GitHub
                // MCP server with the user's token, or updates it if one exists.
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
                // Toasts are handled in the mutations; keep the modal open so
                // the user can fix the token and retry.
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
            <Paper
                withBorder
                radius="md"
                p="md"
                component="section"
                aria-label="Loading tools to connect"
                aria-busy="true"
            >
                <Stack gap="md">
                    <Stack gap={4}>
                        <Skeleton h={16} w={190} radius="xl" />
                        <Skeleton h={12} w="75%" radius="xl" />
                    </Stack>
                    <Group gap="xs">
                        {[0, 1].map((item) => (
                            <Skeleton
                                key={item}
                                h={30}
                                w={150}
                                radius="md"
                                visible
                            />
                        ))}
                    </Group>
                </Stack>
            </Paper>
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

    // GitHub is the marquee integration: when it's the only thing to connect,
    // lead with what connecting unlocks instead of the generic app copy.
    const isGithubOnly =
        canOneClickConnectGithub && mcpServersNeedingConnection.length === 0;
    const sectionTitle = isGithubOnly
        ? GITHUB_MCP_VALUE_HEADLINE
        : getConnectionTitle(appNames);
    const sectionSummary = isGithubOnly
        ? GITHUB_MCP_VALUE_SUMMARY
        : getConnectionSummary(appNames);

    const githubConnectButton = canOneClickConnectGithub ? (
        <Button
            key="github-connect"
            size="xs"
            variant="default"
            leftSection={<MantineIcon icon={IconBrandGithub} />}
            loading={isConnectingGithubMcp || isAttachingGithub}
            onClick={githubConfirmModalHandlers.open}
        >
            Connect GitHub
        </Button>
    ) : null;

    const isSingleApp = appNames.length === 1;

    return (
        <Paper
            withBorder
            radius="md"
            p="md"
            component="section"
            aria-labelledby={sectionTitleId}
            aria-busy={isStartingMcpOAuthConnection}
        >
            {isSingleApp ? (
                <Group
                    justify="space-between"
                    align="center"
                    gap="md"
                    wrap="wrap"
                >
                    <Group
                        align="flex-start"
                        gap="sm"
                        style={{ flex: 1, minWidth: 0 }}
                    >
                        <Paper p="xxs" withBorder radius="sm">
                            <MantineIcon icon={IconInfoCircle} size="sm" />
                        </Paper>
                        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                            <Text id={sectionTitleId} size="sm" fw={600}>
                                {sectionTitle}
                            </Text>
                            <Text size="sm" c="dimmed">
                                {sectionSummary}
                            </Text>
                            {connectionNote && (
                                <Text size="xs" c="dimmed">
                                    {connectionNote}
                                </Text>
                            )}
                        </Stack>
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
                                size="xs"
                                variant="default"
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
                <Stack gap="sm">
                    <Stack gap={4}>
                        <Group align="center" gap="xs">
                            <Paper p="xxs" withBorder radius="sm">
                                <MantineIcon icon={IconInfoCircle} size="sm" />
                            </Paper>
                            <Text id={sectionTitleId} size="sm" fw={600}>
                                {sectionTitle}
                            </Text>
                        </Group>
                        <Text size="sm" c="dimmed">
                            {sectionSummary}
                        </Text>
                        {connectionNote && (
                            <Text size="xs" c="dimmed">
                                {connectionNote}
                            </Text>
                        )}
                    </Stack>
                    <Group gap="xs">
                        {mcpServersNeedingConnection.map((mcpServer) => {
                            const isConnecting =
                                isStartingMcpOAuthConnection &&
                                startingMcpOAuthConnection?.mcpServerUuid ===
                                    mcpServer.uuid;
                            const iconColor = getConnectionIconColor(mcpServer);

                            return (
                                <Button
                                    key={mcpServer.uuid}
                                    size="xs"
                                    variant="default"
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
        </Paper>
    );
};
