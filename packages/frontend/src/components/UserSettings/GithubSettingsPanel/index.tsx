import { type ApiError, type GitRepo } from '@lightdash/common';
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
    Tooltip,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconClock,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, type FC } from 'react';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import useSearchParams from '../../../hooks/useSearchParams';
import githubIcon from '../../../svgs/github-icon.svg';
import MantineIcon from '../../common/MantineIcon';
import { SettingsGridCard } from '../../common/Settings/SettingsCard';

const getGithubRepositories = async () =>
    lightdashApi<GitRepo[]>({
        url: `/github/repos/list`,
        method: 'GET',
        body: undefined,
    });

export const useGitHubRepositories = () => {
    const { showToastApiError } = useToaster();

    return useQuery<GitRepo[], ApiError>({
        queryKey: ['github_branches'],
        queryFn: () => getGithubRepositories(),
        retry: false,
        onError: ({ error }) => {
            if (error.statusCode === 404 || error.statusCode === 401) return; // Ignore missing installation errors or unauthorized in demo

            showToastApiError({
                title: 'Failed to get GitHub integration',
                apiError: error,
            });
        },
    });
};
const deleteGithubInstallation = async () =>
    lightdashApi<null>({
        url: `/github/uninstall`,
        method: 'DELETE',
        body: undefined,
    });

const useDeleteGithubInstallationMutation = () => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<null, ApiError>(
        ['delete_github_installation'],
        () => deleteGithubInstallation(),
        {
            onSuccess: async () => {
                await queryClient.invalidateQueries(['github_branches']);
                showToastSuccess({
                    title: 'GitHub integration deleted',
                    subtitle:
                        'You have successfully deleted your GitHub integration.',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to delete GitHub integration',
                    apiError: error,
                });
            },
        },
    );
};

const GITHUB_INSTALL_URL = `/api/v1/github/install`;

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
        return <Loader />;
    }

    return (
        <SettingsGridCard>
            <Box>
                <Group spacing="sm">
                    <Avatar src={githubIcon} size="md" />
                    <Title order={4}>Github</Title>
                </Group>
            </Box>

            <Stack>
                <Text color="dimmed" fz="xs">
                    Installing GitHub App allows Lightdash to access your GitHub
                    repositories and create pull requests.
                </Text>

                {isValidGithubInstallation && data.length === 0 && (
                    <Alert
                        color="blue"
                        icon={<MantineIcon icon={IconAlertCircle} />}
                    >
                        Your GitHub integration doesn't have access to any
                        repository.
                    </Alert>
                )}
                {isValidGithubInstallation && data && data.length > 0 && (
                    <Text color="dimmed" fz="xs">
                        Your GitHub integration has access to the following
                        repositories:
                        <ul>
                            {data.map((repo) => (
                                <li key={repo.fullName}>{repo.fullName}</li>
                            ))}
                        </ul>
                    </Text>
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
                                leftIcon={<MantineIcon icon={IconRefresh} />}
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
                                px="xs"
                                color="red"
                                variant="outline"
                                onClick={() =>
                                    deleteGithubInstallationMutation.mutate()
                                }
                                leftIcon={<MantineIcon icon={IconTrash} />}
                            >
                                Delete
                            </Button>
                        </Group>
                    </Stack>
                ) : (
                    <Flex justify="end">
                        {isWaitingForGithubRequest ? (
                            <Tooltip
                                multiline
                                maw={400}
                                label={`
                                An admin from your GitHub organization needs to approve this app
                                installation. They should have received an email for a "Request to install lightdash" from GitHub.`}
                            >
                                <Button
                                    size="xs"
                                    component="a"
                                    target="_blank"
                                    color="yellow"
                                    variant="outline"
                                    href={GITHUB_INSTALL_URL}
                                    leftIcon={<MantineIcon icon={IconClock} />}
                                >
                                    Pending approval
                                </Button>
                            </Tooltip>
                        ) : (
                            <Button
                                size="xs"
                                component="a"
                                target="_blank"
                                color="blue"
                                href={GITHUB_INSTALL_URL}
                            >
                                Install
                            </Button>
                        )}
                    </Flex>
                )}
            </Stack>
        </SettingsGridCard>
    );
};

export default GithubSettingsPanel;
