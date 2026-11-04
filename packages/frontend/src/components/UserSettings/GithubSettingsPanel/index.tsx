import {
    Alert,
    Avatar,
    Button,
    Group,
    ScrollArea,
    Stack,
    Text,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconClock,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import { useEffect, type FC, type ReactNode } from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
import useSearchParams from '../../../hooks/useSearchParams';
import githubIcon from '../../../svgs/github-icon.svg';
import EmptyStateLoader from '../../common/EmptyStateLoader';
import {
    useDeleteGithubInstallationMutation,
    useGitHubRepositories,
} from '../../common/GithubIntegration/hooks/useGithubIntegration';
import MantineIcon from '../../common/MantineIcon';
import {
    SettingRow,
    SettingsSection,
} from '../../common/Settings/SettingLayout';
import { SettingsCard } from '../../common/Settings/SettingsCard';

const GITHUB_INSTALL_URL = `/api/v1/github/install`;

const GithubSection: FC<{ children: ReactNode }> = ({ children }) => (
    <SettingsSection
        label="GitHub"
        description="Install the GitHub App to access your repositories and create pull requests."
    >
        <SettingsCard>{children}</SettingsCard>
    </SettingsSection>
);

const GithubSettingsPanel: FC = () => {
    const { data, isError, isInitialLoading } = useGitHubRepositories();
    const deleteGithubInstallationMutation =
        useDeleteGithubInstallationMutation();

    const status = useSearchParams('status');
    const { showToastWarning } = useToaster();
    const isWaitingForGithubRequest = status === 'github_request_sent';

    const isValidGithubInstallation = data !== undefined && !isError;

    useEffect(() => {
        if (
            isWaitingForGithubRequest &&
            !isValidGithubInstallation &&
            !isInitialLoading
        ) {
            const toastKey = 'github_request_sent';
            showToastWarning({
                title: 'GitHub app installation pending',
                subtitle:
                    'The GitHub app is waiting to be authorized by a Github admin.',
                key: toastKey,
            });
        }
    }, [
        isWaitingForGithubRequest,
        isValidGithubInstallation,
        isInitialLoading,
        showToastWarning,
    ]);

    if (isInitialLoading) {
        return (
            <GithubSection>
                <EmptyStateLoader mih={60} />
            </GithubSection>
        );
    }

    const logo = <Avatar src={githubIcon} size="sm" alt="" />;

    if (!isValidGithubInstallation) {
        return (
            <GithubSection>
                <SettingRow
                    titlePrefix={logo}
                    title={
                        isWaitingForGithubRequest
                            ? 'Pending approval'
                            : 'Not connected'
                    }
                    description={
                        isWaitingForGithubRequest
                            ? 'An admin from your GitHub organization needs to approve this app installation. They should have received an email for a "Request to install lightdash" from GitHub.'
                            : 'Install the GitHub App on your organization to get started.'
                    }
                    control={
                        isWaitingForGithubRequest ? (
                            <Button
                                size="xs"
                                component="a"
                                target="_blank"
                                color="yellow"
                                variant="outline"
                                href={GITHUB_INSTALL_URL}
                                leftSection={<MantineIcon icon={IconClock} />}
                            >
                                Pending approval
                            </Button>
                        ) : (
                            <Button
                                size="xs"
                                component="a"
                                target="_blank"
                                href={GITHUB_INSTALL_URL}
                            >
                                Install
                            </Button>
                        )
                    }
                />
            </GithubSection>
        );
    }

    return (
        <GithubSection>
            <Stack gap="md">
                <SettingRow
                    titlePrefix={logo}
                    title="Connected"
                    description={
                        data.length > 0
                            ? `Your GitHub integration has access to the following repositories (${data.length}):`
                            : 'The GitHub App is installed.'
                    }
                    control={
                        <Group gap="xs">
                            <Button
                                size="xs"
                                component="a"
                                target="_blank"
                                variant="default"
                                href={GITHUB_INSTALL_URL}
                                leftSection={<MantineIcon icon={IconRefresh} />}
                                onClick={() => {
                                    deleteGithubInstallationMutation.mutate(
                                        undefined,
                                        {
                                            onSuccess: () => {
                                                window.open(
                                                    GITHUB_INSTALL_URL,
                                                    '_blank',
                                                );
                                            },
                                        },
                                    );
                                }}
                            >
                                Reinstall
                            </Button>
                            <Button
                                size="xs"
                                variant="subtle"
                                color="red"
                                onClick={() =>
                                    deleteGithubInstallationMutation.mutate()
                                }
                                leftSection={<MantineIcon icon={IconTrash} />}
                            >
                                Disconnect
                            </Button>
                        </Group>
                    }
                >
                    {data.length > 0 && (
                        <ScrollArea.Autosize mah={200} mt="xs">
                            <Text
                                component="ul"
                                fz="xs"
                                c="dimmed"
                                m={0}
                                pl="md"
                            >
                                {data.map((repo) => (
                                    <li key={repo.fullName}>{repo.fullName}</li>
                                ))}
                            </Text>
                        </ScrollArea.Autosize>
                    )}
                </SettingRow>

                {data.length === 0 && (
                    <Alert
                        color="blue"
                        icon={<MantineIcon icon={IconAlertCircle} />}
                    >
                        Your GitHub integration doesn't have access to any
                        repository.
                    </Alert>
                )}
            </Stack>
        </GithubSection>
    );
};

export default GithubSettingsPanel;
