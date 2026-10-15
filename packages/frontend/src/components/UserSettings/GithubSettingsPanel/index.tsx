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
    Tooltip,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconClock,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import useToaster from '../../../hooks/toaster/useToaster';
import useSearchParams from '../../../hooks/useSearchParams';
import githubIcon from '../../../svgs/github-icon.svg';
import {
    useDeleteGithubInstallationMutation,
    useGitHubRepositories,
} from '../../common/GithubIntegration/hooks/useGithubIntegration';
import MantineIcon from '../../common/MantineIcon';
import { SettingsGridCard } from '../../common/Settings/SettingsCard';
import classes from './GithubSettingsPanel.module.css';

const GITHUB_INSTALL_URL = `/api/v1/github/install`;

const GithubSettingsPanel: FC = () => {
    const { t } = useTranslation('userSettings');
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
                title: t('githubSettingsPanel.pendingToast.title'),
                subtitle: t('githubSettingsPanel.pendingToast.subtitle'),
                key: toastKey,
            });
        }
    }, [
        isWaitingForGithubRequest,
        isValidGithubInstallation,
        isInitialLoading,
        showToastWarning,
        t,
    ]);

    if (isInitialLoading) {
        return <Loader />;
    }

    return (
        <SettingsGridCard>
            <Box>
                <Group gap="sm">
                    <Avatar src={githubIcon} size="md" alt="" />
                    <Title order={5}>GitHub</Title>
                </Group>
            </Box>

            <Stack>
                <Text c="dimmed" fz="xs">
                    {t('githubSettingsPanel.description')}
                </Text>

                {isValidGithubInstallation && data.length === 0 && (
                    <Alert
                        color="blue"
                        icon={<MantineIcon icon={IconAlertCircle} />}
                    >
                        {t('githubSettingsPanel.noRepositories')}
                    </Alert>
                )}
                {isValidGithubInstallation && data && data.length > 0 && (
                    <Stack gap="xs">
                        <Text c="dimmed" fz="xs">
                            {t('githubSettingsPanel.repositoriesAccess', {
                                count: data.length,
                            })}
                        </Text>
                        <Box mah={200} className={classes.repositoryList}>
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
                        </Box>
                    </Stack>
                )}

                {isValidGithubInstallation ? (
                    <Stack align="end">
                        <Group>
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
                                {t('githubSettingsPanel.reinstall')}
                            </Button>
                            <Button
                                size="xs"
                                px="xs"
                                color="red"
                                variant="outline"
                                onClick={() =>
                                    deleteGithubInstallationMutation.mutate()
                                }
                                leftSection={<MantineIcon icon={IconTrash} />}
                            >
                                {t('actions.delete', { ns: 'common' })}
                            </Button>
                        </Group>
                    </Stack>
                ) : (
                    <Flex justify="end">
                        {isWaitingForGithubRequest ? (
                            <Tooltip
                                maw={400}
                                label={t(
                                    'githubSettingsPanel.pendingApprovalTooltip',
                                )}
                            >
                                <Button
                                    size="xs"
                                    component="a"
                                    target="_blank"
                                    color="yellow"
                                    variant="outline"
                                    href={GITHUB_INSTALL_URL}
                                    leftSection={
                                        <MantineIcon icon={IconClock} />
                                    }
                                >
                                    {t('githubSettingsPanel.pendingApproval')}
                                </Button>
                            </Tooltip>
                        ) : (
                            <Button
                                size="xs"
                                component="a"
                                target="_blank"
                                href={GITHUB_INSTALL_URL}
                            >
                                {t('githubSettingsPanel.install')}
                            </Button>
                        )}
                    </Flex>
                )}
            </Stack>
        </SettingsGridCard>
    );
};

export default GithubSettingsPanel;
