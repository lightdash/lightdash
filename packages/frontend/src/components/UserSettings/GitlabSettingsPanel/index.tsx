import {
    Alert,
    Avatar,
    Box,
    Button,
    Flex,
    Group,
    Loader,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconAlertCircle, IconRefresh, IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import gitlabIcon from '../../../svgs/gitlab-icon.svg';
import {
    useDeleteGitlabInstallationMutation,
    useGitlabRepositories,
} from '../../common/GitlabIntegration/hooks/useGitlabIntegration';
import MantineIcon from '../../common/MantineIcon';
import { SettingsGridCard } from '../../common/Settings/SettingsCard';

const GITLAB_INSTALL_URL = `/api/v1/gitlab/install`;

const GitlabSettingsPanel: FC = () => {
    const { data, isError, isInitialLoading } = useGitlabRepositories();
    const deleteGitlabInstallationMutation =
        useDeleteGitlabInstallationMutation();

    const isValidGitlabInstallation = data !== undefined && !isError;

    if (isInitialLoading) {
        return <Loader />;
    }

    return (
        <SettingsGridCard>
            <Box>
                <Group spacing="sm">
                    <Avatar src={gitlabIcon} size="md" />
                    <Title order={4}>GitLab</Title>
                </Group>
            </Box>

            <Stack>
                <Text color="dimmed" fz="xs">
                    Connect your GitLab account to enable write-back
                    functionality and create merge requests directly from
                    Lightdash.
                </Text>

                {isValidGitlabInstallation && data.length === 0 && (
                    <Alert
                        color="blue"
                        icon={<MantineIcon icon={IconAlertCircle} />}
                    >
                        Your GitLab integration doesn't have access to any
                        projects.
                    </Alert>
                )}
                {isValidGitlabInstallation && data && data.length > 0 && (
                    <Text color="dimmed" fz="xs">
                        Your GitLab integration has access to the following
                        projects:
                        <ul>
                            {data.map((repo) => (
                                <li key={repo.fullName}>{repo.fullName}</li>
                            ))}
                        </ul>
                    </Text>
                )}

                {isValidGitlabInstallation ? (
                    <Stack align="end">
                        <Group>
                            <Button
                                size="xs"
                                component="a"
                                target="_blank"
                                variant="default"
                                href={GITLAB_INSTALL_URL}
                                leftIcon={<MantineIcon icon={IconRefresh} />}
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
                                Reconnect
                            </Button>
                            <Button
                                size="xs"
                                px="xs"
                                color="red"
                                variant="outline"
                                onClick={() =>
                                    deleteGitlabInstallationMutation.mutate()
                                }
                                leftIcon={<MantineIcon icon={IconTrash} />}
                            >
                                Delete
                            </Button>
                        </Group>
                    </Stack>
                ) : (
                    <Flex justify="end">
                        <Button
                            size="xs"
                            component="a"
                            target="_blank"
                            href={GITLAB_INSTALL_URL}
                        >
                            Install
                        </Button>
                    </Flex>
                )}
            </Stack>
        </SettingsGridCard>
    );
};

export default GitlabSettingsPanel;
