import {
    GITHUB_MCP_SERVER_URL,
    type AiMcpCredentialScope,
} from '@lightdash/common';
import { Button, Group, Paper, Stack, Text } from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import { IconBrandGithub } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useProjectUpdateAiAgentMutation } from '../../hooks/useProjectAiAgents';
import {
    useAgentAiMcpServers,
    useConnectGithubMcpServerMutation,
    useGithubMcpAvailability,
} from '../../hooks/useProjectAiMcpServers';
import { GithubMcpConnectModal } from '../GithubMcpConnectModal';

type Props = {
    projectUuid: string;
    agentUuid: string;
};

/**
 * Shown when a user downvotes a change the agent made and the agent has no
 * git/codebase integration. Without the source that produces their data the
 * agent is editing blind, so we nudge the user to connect one to enhance the
 * changes.
 */
export const ConnectCodebaseNudge: FC<Props> = ({ projectUuid, agentUuid }) => {
    const { data: mcpServers, refetch: refetchAgentMcpServers } =
        useAgentAiMcpServers(projectUuid, agentUuid, {
            enabled: !!projectUuid && !!agentUuid,
        });
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
    const [modalOpened, modalHandlers] = useDisclosure(false);

    const hasGitIntegration = (mcpServers ?? []).some(
        (mcpServer) => mcpServer.url === GITHUB_MCP_SERVER_URL,
    );
    const canOneClickConnectGithub =
        githubMcpAvailability?.available === true &&
        githubMcpAvailability?.alreadyConnected === false;

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
                modalHandlers.close();
            } catch {
                // Toasts are handled in the mutations.
            } finally {
                await refetchAgentMcpServers();
            }
        },
        [
            agentUuid,
            connectGithubMcp,
            mcpServers,
            modalHandlers,
            refetchAgentMcpServers,
            updateAgentMcpServers,
        ],
    );

    // Nothing to nudge if the agent already has codebase context, or we have no
    // way to connect one from here.
    if (hasGitIntegration || !canOneClickConnectGithub) {
        return null;
    }

    return (
        <Paper p="sm" mt="xs" radius="md" withBorder>
            <Group align="flex-start" gap="sm" wrap="nowrap">
                <Paper p="xxs" withBorder radius="sm">
                    <MantineIcon icon={IconBrandGithub} size="sm" />
                </Paper>
                <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
                    <Stack gap={2}>
                        <Text size="sm" fw={600}>
                            Not quite right?
                        </Text>
                        <Text size="sm" c="dimmed">
                            The agent made these changes without seeing the code
                            behind your data. Connect GitHub so it can read the
                            source that produces your metrics and make better
                            changes.
                        </Text>
                    </Stack>
                    <Group gap="xs">
                        <Button
                            size="xs"
                            variant="default"
                            leftSection={
                                <MantineIcon icon={IconBrandGithub} />
                            }
                            loading={isConnectingGithubMcp || isAttachingGithub}
                            onClick={modalHandlers.open}
                        >
                            Connect GitHub
                        </Button>
                    </Group>
                </Stack>
            </Group>
            <GithubMcpConnectModal
                opened={modalOpened}
                onClose={modalHandlers.close}
                isLoading={isConnectingGithubMcp || isAttachingGithub}
                onConnect={handleConnectGithubMcp}
            />
        </Paper>
    );
};
