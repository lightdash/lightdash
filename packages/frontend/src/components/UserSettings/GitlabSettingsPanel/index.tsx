import {
    Alert,
    Avatar,
    Button,
    Group,
    ScrollArea,
    Stack,
    Text,
} from '@mantine/core';
import { IconAlertCircle, IconRefresh, IconTrash } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import gitlabIcon from '../../../svgs/gitlab-icon.svg';
import EmptyStateLoader from '../../common/EmptyStateLoader';
import {
    useDeleteGitlabInstallationMutation,
    useGitlabRepositories,
} from '../../common/GitlabIntegration/hooks/useGitlabIntegration';
import MantineIcon from '../../common/MantineIcon';
import {
    SettingRow,
    SettingsSection,
} from '../../common/Settings/SettingLayout';
import { SettingsCard } from '../../common/Settings/SettingsCard';

const GITLAB_INSTALL_URL = `/api/v1/gitlab/install`;

const GitlabSection: FC<{ children: ReactNode }> = ({ children }) => (
    <SettingsSection
        label="GitLab"
        description="Connect your GitLab account to enable write-back and create merge requests."
    >
        <SettingsCard>{children}</SettingsCard>
    </SettingsSection>
);

const GitlabSettingsPanel: FC = () => {
    const { data, isError, isInitialLoading } = useGitlabRepositories();
    const deleteGitlabInstallationMutation =
        useDeleteGitlabInstallationMutation();

    const isValidGitlabInstallation = data !== undefined && !isError;

    if (isInitialLoading) {
        return (
            <GitlabSection>
                <EmptyStateLoader mih={60} />
            </GitlabSection>
        );
    }

    const logo = <Avatar src={gitlabIcon} size="sm" alt="" />;

    if (!isValidGitlabInstallation) {
        return (
            <GitlabSection>
                <SettingRow
                    titlePrefix={logo}
                    title="Not connected"
                    description="Connect your GitLab account to get started."
                    control={
                        <Button
                            size="xs"
                            component="a"
                            target="_blank"
                            href={GITLAB_INSTALL_URL}
                        >
                            Install
                        </Button>
                    }
                />
            </GitlabSection>
        );
    }

    return (
        <GitlabSection>
            <Stack gap="md">
                <SettingRow
                    titlePrefix={logo}
                    title="Connected"
                    description={
                        data.length > 0
                            ? `Your GitLab integration has access to the following projects (${data.length}):`
                            : 'Your GitLab account is connected.'
                    }
                    control={
                        <Group gap="xs">
                            <Button
                                size="xs"
                                component="a"
                                target="_blank"
                                variant="default"
                                href={GITLAB_INSTALL_URL}
                                leftSection={<MantineIcon icon={IconRefresh} />}
                                onClick={() => {
                                    deleteGitlabInstallationMutation.mutate(
                                        undefined,
                                        {
                                            onSuccess: () => {
                                                window.open(
                                                    GITLAB_INSTALL_URL,
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
                                    deleteGitlabInstallationMutation.mutate()
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
                        Your GitLab integration doesn't have access to any
                        projects.
                    </Alert>
                )}
            </Stack>
        </GitlabSection>
    );
};

export default GitlabSettingsPanel;
