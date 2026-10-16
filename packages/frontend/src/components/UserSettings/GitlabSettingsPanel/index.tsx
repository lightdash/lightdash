import {
    Alert,
    Box,
    Flex,
    Group,
    Loader,
    Stack,
    Text,
    Title,
    Button,
    Avatar,
} from '@mantine/core';
import { IconAlertCircle, IconRefresh, IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import gitlabIcon from '../../../svgs/gitlab-icon.svg';
import {
    useDeleteGitlabInstallationMutation,
    useGitlabRepositories,
} from '../../common/GitlabIntegration/hooks/useGitlabIntegration';
import MantineIcon from '../../common/MantineIcon';
import { SettingsGridCard } from '../../common/Settings/SettingsCard';

const GITLAB_INSTALL_URL = `/api/v1/gitlab/install`;

const GitlabSettingsPanel: FC = () => {
    const { t } = useTranslation('userSettings');
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
                <Group gap="sm">
                    <Avatar src={gitlabIcon} size="md" alt="" />
                    <Title order={5}>GitLab</Title>
                </Group>
            </Box>

            <Stack>
                <Text c="dimmed" fz="xs">
                    {t('gitlabSettingsPanel.description')}
                </Text>

                {isValidGitlabInstallation && data.length === 0 && (
                    <Alert
                        color="blue"
                        icon={<MantineIcon icon={IconAlertCircle} />}
                    >
                        {t('gitlabSettingsPanel.noProjects')}
                    </Alert>
                )}
                {isValidGitlabInstallation && data && data.length > 0 && (
                    <Text c="dimmed" fz="xs">
                        {t('gitlabSettingsPanel.projectsAccess')}
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
                                {t('gitlabSettingsPanel.reconnect')}
                            </Button>
                            <Button
                                size="xs"
                                px="xs"
                                color="red"
                                variant="outline"
                                onClick={() =>
                                    deleteGitlabInstallationMutation.mutate()
                                }
                                leftSection={<MantineIcon icon={IconTrash} />}
                            >
                                {t('actions.delete', { ns: 'common' })}
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
                            {t('gitlabSettingsPanel.install')}
                        </Button>
                    </Flex>
                )}
            </Stack>
        </SettingsGridCard>
    );
};

export default GitlabSettingsPanel;
