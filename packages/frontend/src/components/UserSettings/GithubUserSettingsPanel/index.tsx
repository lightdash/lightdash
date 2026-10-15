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
} from '@mantine/core';
import { IconBrandGithub, IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import githubIcon from '../../../svgs/github-icon.svg';
import {
    GITHUB_USER_AUTHORIZE_URL,
    useGithubUserCredential,
    useUnlinkGithubUserMutation,
} from '../../common/GithubIntegration/hooks/useGithubIntegration';
import MantineIcon from '../../common/MantineIcon';
import { SettingsGridCard } from '../../common/Settings/SettingsCard';

const GithubUserSettingsPanel: FC = () => {
    const { t } = useTranslation('userSettings');
    const { data: credential, isInitialLoading } = useGithubUserCredential();
    const unlinkGithubUserMutation = useUnlinkGithubUserMutation();

    if (isInitialLoading) {
        return <Loader />;
    }

    return (
        <SettingsGridCard>
            <Box>
                <Group gap="sm">
                    <Avatar src={githubIcon} size="md" />
                    <Title order={5}>
                        {t('githubUserSettingsPanel.title')}
                    </Title>
                </Group>
            </Box>

            <Stack>
                <Text c="dimmed" fz="xs">
                    {t('githubUserSettingsPanel.description')}
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
                            {t('githubUserSettingsPanel.unlink')}
                        </Button>
                    </Group>
                ) : (
                    <Flex justify="end">
                        <Button
                            size="xs"
                            component="a"
                            target="_blank"
                            href={`${GITHUB_USER_AUTHORIZE_URL}?redirect=/generalSettings/profile`}
                            leftSection={<MantineIcon icon={IconBrandGithub} />}
                        >
                            {t('githubUserSettingsPanel.connect')}
                        </Button>
                    </Flex>
                )}
            </Stack>
        </SettingsGridCard>
    );
};

export default GithubUserSettingsPanel;
