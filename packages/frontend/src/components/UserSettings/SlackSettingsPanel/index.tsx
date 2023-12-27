import {
    Alert,
    Anchor,
    Avatar,
    Button,
    Flex,
    Group,
    Loader,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconAlertCircle, IconTrash } from '@tabler/icons-react';
import { FC } from 'react';
import { useDeleteSlack, useGetSlack } from '../../../hooks/useSlack';
import slackSvg from '../../../svgs/slack.svg';
import MantineIcon from '../../common/MantineIcon';
import { SettingsGridCard } from '../../common/Settings/SettingsCard';
import { hasRequiredScopes } from './utils/hasRequiredScopes';

const SlackSettingsPanel: FC = () => {
    const { data, isError, isLoading } = useGetSlack();
    const { mutate: deleteSlack } = useDeleteSlack();

    const installUrl = `/api/v1/slack/install/`;

    if (isLoading) {
        return <Loader />;
    }

    const isValidSlack = data?.slackTeamName !== undefined && !isError;
    return (
        <SettingsGridCard>
            <div>
                <Stack spacing="lg">
                    <Group spacing="sm">
                        <Avatar src={slackSvg} size="sm" />
                        <Title order={4}>Slack integration</Title>
                    </Group>

                    <Stack spacing="xs">
                        {isValidSlack && (
                            <Text color="dimmed">
                                Added to the{' '}
                                <Text span fw={500} color="black">
                                    {data.slackTeamName}
                                </Text>{' '}
                                Slack workspace.
                            </Text>
                        )}

                        <Text color="dimmed">
                            Sharing in Slack allows you to unfurl Lightdash URLs
                            in your workspace.{' '}
                            <Anchor href="https://docs.lightdash.com/guides/sharing-in-slack">
                                View docs
                            </Anchor>
                        </Text>
                    </Stack>
                </Stack>
            </div>

            <div>
                {isValidSlack ? (
                    <Stack align="end">
                        <Group>
                            <Button
                                component="a"
                                target="_blank"
                                color="blue"
                                href={installUrl}
                            >
                                Reinstall
                            </Button>
                            <Button
                                px="xs"
                                color="red"
                                onClick={() => deleteSlack(undefined)}
                            >
                                <MantineIcon icon={IconTrash} />
                            </Button>
                        </Group>

                        {data && !hasRequiredScopes(data) && (
                            <Alert
                                color="blue"
                                icon={<MantineIcon icon={IconAlertCircle} />}
                            >
                                Your Slack integration is not up to date, you
                                should reinstall the Slack integration to
                                guarantee the best user experience.
                            </Alert>
                        )}
                    </Stack>
                ) : (
                    <Flex justify="end">
                        <Button
                            component="a"
                            target="_blank"
                            color="blue"
                            href={installUrl}
                        >
                            Add to Slack
                        </Button>
                    </Flex>
                )}
            </div>
        </SettingsGridCard>
    );
};

export default SlackSettingsPanel;
