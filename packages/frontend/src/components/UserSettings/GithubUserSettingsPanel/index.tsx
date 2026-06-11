import { FeatureFlags } from '@lightdash/common';
import {
    Avatar,
    Box,
    Button,
    Flex,
    Group,
    Loader,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { IconBrandGithub, IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import githubIcon from '../../../svgs/github-icon.svg';
import {
    GITHUB_USER_AUTHORIZE_URL,
    useGithubUserCredential,
    useUnlinkGithubUserMutation,
} from '../../common/GithubIntegration/hooks/useGithubIntegration';
import MantineIcon from '../../common/MantineIcon';
import { SettingsGridCard } from '../../common/Settings/SettingsCard';

const GithubUserSettingsPanel: FC = () => {
    const { data: flag } = useServerFeatureFlag(
        FeatureFlags.GithubUserCredentials,
    );
    const { data: credential, isInitialLoading } = useGithubUserCredential();
    const unlinkGithubUserMutation = useUnlinkGithubUserMutation();

    if (!flag?.enabled) {
        return null;
    }

    if (isInitialLoading) {
        return <Loader />;
    }

    return (
        <SettingsGridCard>
            <Box>
                <Group gap="sm">
                    <Avatar src={githubIcon} size="md" />
                    <Title order={4}>My GitHub account</Title>
                </Group>
            </Box>

            <Stack>
                <Text c="dimmed" fz="xs">
                    Link your personal GitHub account so commits and pull
                    requests created by Lightdash are authored as you. Without a
                    linked account they are created by the Lightdash bot.
                </Text>

                {credential ? (
                    <Group justify="space-between">
                        <Group gap="xs">
                            <MantineIcon icon={IconBrandGithub} />
                            <Text fz="sm" fw={500}>
                                @{credential.githubLogin}
                            </Text>
                        </Group>
                        <Button
                            size="xs"
                            color="red"
                            variant="outline"
                            leftSection={<MantineIcon icon={IconTrash} />}
                            loading={unlinkGithubUserMutation.isLoading}
                            onClick={() => unlinkGithubUserMutation.mutate()}
                        >
                            Unlink
                        </Button>
                    </Group>
                ) : (
                    <Flex justify="end">
                        <Button
                            size="xs"
                            component="a"
                            target="_blank"
                            color="blue"
                            href={`${GITHUB_USER_AUTHORIZE_URL}?redirect=/generalSettings/profile`}
                            leftSection={<MantineIcon icon={IconBrandGithub} />}
                        >
                            Connect GitHub account
                        </Button>
                    </Flex>
                )}
            </Stack>
        </SettingsGridCard>
    );
};

export default GithubUserSettingsPanel;
