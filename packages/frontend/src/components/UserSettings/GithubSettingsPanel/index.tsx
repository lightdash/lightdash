import { ApiError } from '@lightdash/common';
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
import { useQuery } from '@tanstack/react-query';
import { FC } from 'react';
import { lightdashApi } from '../../../api';
import githubIcon from '../../../svgs/github-icon.svg';
import MantineIcon from '../../common/MantineIcon';
import { SettingsGridCard } from '../../common/Settings/SettingsCard';

const getGithubRepositories = async () =>
    lightdashApi<any>({
        url: `/github/list`,
        method: 'GET',
        body: undefined,
    });

const useGitHubRepositories = () =>
    useQuery<any, ApiError>({
        queryKey: ['github', 'branches'],
        queryFn: () => getGithubRepositories(),
        retry: false,
    });

const GITHUB_INSTALL_URL = `/api/v1/github/install/`;

const GithubSettingsPanel: FC = () => {
    const { data, isError, isInitialLoading } = useGitHubRepositories();
    console.log('data', data);
    const isValidGithubInstallation = data !== undefined && !isError;
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
                            >
                                Reinstall
                            </Button>
                            <Button
                                size="xs"
                                px="xs"
                                color="red"
                                variant="outline"
                                onClick={() => undefined} // todo
                                leftIcon={<MantineIcon icon={IconTrash} />}
                            >
                                Delete
                            </Button>
                        </Group>

                        {data && data.length <= 0 && (
                            <Alert
                                color="blue"
                                icon={<MantineIcon icon={IconAlertCircle} />}
                            >
                                Your GitHub integration doesn't have access to
                                any repository.
                            </Alert>
                        )}
                    </Stack>
                ) : (
                    <Flex justify="end">
                        <Button
                            size="xs"
                            component="a"
                            target="_blank"
                            color="blue"
                            href={GITHUB_INSTALL_URL}
                        >
                            Install
                        </Button>
                    </Flex>
                )}
            </Stack>
        </SettingsGridCard>
    );
};

export default GithubSettingsPanel;
