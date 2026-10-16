import {
    GITHUB_MCP_SERVER_NAME,
    type AiMcpCredentialScope,
    type AiMcpServer,
} from '@lightdash/common';
import { Box, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconBrandGithub,
    IconCircleCheck,
    IconInfoCircle,
    IconSparkles,
} from '@tabler/icons-react';
import { useCallback, useId, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../../components/common/MantineIcon';
import i18n from '../../../../i18n/i18n';
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
    getGithubMcpSuggestedPrompt,
    getGithubMcpValueSummary,
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
        return i18n.t('mcpConnections.signIn', { ns: 'aiAgent' });
    }

    if (mcpServer.connectionStatus === 'error') {
        return i18n.t('mcpConnections.signIn', { ns: 'aiAgent' });
    }

    return i18n.t('mcpConnections.signIn', { ns: 'aiAgent' });
};

const getMultiAppConnectionActionLabel = (
    mcpServer: Pick<AiMcpServer, 'name'>,
) =>
    i18n.t('mcpInput.oauthAction.signIn', {
        ns: 'aiAgent',
        name: mcpServer.name,
    });

const getConnectionNote = (
    mcpServer: Pick<AiMcpServer, 'connectionStatus' | 'credentialScope'>,
) => {
    if (
        mcpServer.connectionStatus === 'connected' &&
        mcpServer.credentialScope === 'shared'
    ) {
        return i18n.t('mcpConnections.notes.shared', { ns: 'aiAgent' });
    }

    if (mcpServer.connectionStatus === 'error') {
        return i18n.t('mcpConnections.notes.error', { ns: 'aiAgent' });
    }

    if (mcpServer.connectionStatus === 'connecting') {
        return i18n.t('mcpConnections.notes.connecting', { ns: 'aiAgent' });
    }

    return null;
};

const formatAppNames = (names: string[]) =>
    new Intl.ListFormat(i18n.language, {
        style: 'long',
        type: 'conjunction',
    }).format(names);

const getConnectionSummary = (appNames: string[]) => {
    if (appNames.length === 1) {
        return i18n.t('mcpConnections.summarySingle', {
            ns: 'aiAgent',
            name: appNames[0],
        });
    }

    return i18n.t('mcpConnections.summaryMultiple', {
        ns: 'aiAgent',
        names: formatAppNames(appNames),
    });
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
    const { t } = useTranslation('aiAgent');
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
                aria-label={t('githubMcp.connectedHeadline')}
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
                                {t('githubMcp.connectedHeadline')}
                            </Text>
                            <Text size="sm" c="dimmed">
                                {t('githubMcp.connectedSummary')}
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
                                            getGithubMcpSuggestedPrompt(),
                                        );
                                        setJustConnectedGithub(false);
                                    }}
                                >
                                    {getGithubMcpSuggestedPrompt()}
                                </Button>
                                <Button
                                    size="xs"
                                    variant="subtle"
                                    color="gray"
                                    onClick={() =>
                                        setJustConnectedGithub(false)
                                    }
                                >
                                    {t('mcpConnections.dismiss')}
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
        ? getGithubMcpValueSummary()
        : getConnectionSummary(appNames);

    const githubConnectButton = canOneClickConnectGithub ? (
        <Button
            key="github-connect"
            size="compact-xs"
            variant="subtle"
            color="gray"
            leftSection={<MantineIcon icon={IconBrandGithub} />}
            loading={
                isConnectingGithubMcp ||
                isConnectingGithubMcpApp ||
                isAttachingGithub
            }
            onClick={
                canGithubAppConnect
                    ? () => void handleConnectGithubMcpApp()
                    : githubConfirmModalHandlers.open
            }
        >
            {t('mcpConnections.github')}
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
            <Group align="flex-start" gap="sm" wrap="nowrap">
                <MantineIcon
                    icon={IconInfoCircle}
                    size={14}
                    color="ldGray.5"
                    className={styles.connectionIcon}
                />
                <Stack gap="xs" flex={1} miw={0}>
                    <Stack gap={2}>
                        <Text id={sectionTitleId} size="xs" c="dimmed">
                            {sectionSummary}
                        </Text>
                        {connectionNote && (
                            <Text size="xs" c="ldGray.5">
                                {connectionNote}
                            </Text>
                        )}
                    </Stack>
                    <Group gap="xs" wrap="wrap">
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
                                    {isSingleApp
                                        ? getConnectionActionLabel(mcpServer)
                                        : getMultiAppConnectionActionLabel(
                                              mcpServer,
                                          )}
                                </Button>
                            );
                        })}
                        {githubConnectButton}
                    </Group>
                </Stack>
            </Group>
            <GithubMcpConnectModal
                opened={isGithubConfirmModalOpen}
                onClose={githubConfirmModalHandlers.close}
                isLoading={isConnectingGithubMcp || isAttachingGithub}
                onConnect={handleConnectGithubMcp}
            />
        </Box>
    );
};
