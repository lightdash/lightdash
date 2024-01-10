import { slackRequiredScopes, SlackSettings } from '@lightdash/common';
import {
    Alert,
    Anchor,
    Avatar,
    Box,
    Button,
    Flex,
    Group,
    Loader,
    Select,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconAlertCircle, IconCheck, IconTrash } from '@tabler/icons-react';
import intersection from 'lodash/intersection';
import { FC } from 'react';
import {
    useDeleteSlack,
    useGetSlack,
    useSlackChannels,
} from '../../../hooks/slack/useSlack';
import slackSvg from '../../../svgs/slack.svg';
import MantineIcon from '../../common/MantineIcon';
import { SettingsGridCard } from '../../common/Settings/SettingsCard';

export const hasRequiredScopes = (slackSettings: SlackSettings) => {
    return (
        intersection(slackSettings.scopes, slackRequiredScopes).length ===
        slackRequiredScopes.length
    );
};
const SlackSettingsPanel: FC = () => {
    const { data, isError, isLoading } = useGetSlack();
    const isValidSlack = data?.slackTeamName !== undefined && !isError;
    const { data: slackChannels, isLoading: isLoadingSlackChannels } =
        useSlackChannels({
            enabled: isValidSlack,
        });
    const { mutate: deleteSlack } = useDeleteSlack();

    const installUrl = `/api/v1/slack/install/`;

    if (isLoading) {
        return <Loader />;
    }

    return (
        <SettingsGridCard>
            <Box>
                <Stack spacing="lg">
                    <Group spacing="sm">
                        <Avatar src={slackSvg} size="sm" />
                        <Title order={4}>Slack</Title>
                    </Group>

                    <Stack spacing="xs">
                        {isValidSlack && (
                            <Stack spacing="xs">
                                <Alert
                                    p="xs"
                                    icon={<MantineIcon icon={IconCheck} />}
                                    title={
                                        <Text fw={500}>
                                            Added to the Slack workspace:{' '}
                                            <Text span fw={500} color="black">
                                                {data.slackTeamName}
                                            </Text>
                                        </Text>
                                    }
                                    color="green"
                                    styles={{
                                        wrapper: {
                                            alignItems: 'center',
                                        },
                                        title: {
                                            marginBottom: 0,
                                        },
                                        icon: {
                                            marginRight: 0,
                                        },
                                    }}
                                >
                                    <></>
                                </Alert>
                            </Stack>
                        )}

                        <Text color="dimmed">
                            Sharing in Slack allows you to unfurl Lightdash URLs
                            and schedule deliveries to specific people or
                            channels within your Slack workspace.
                            <Anchor href="https://docs.lightdash.com/guides/sharing-in-slack">
                                View docs
                            </Anchor>
                        </Text>

                        <Stack spacing="xs">
                            <Select
                                label="Select a channel to send delivery error notifications to"
                                disabled={isLoadingSlackChannels}
                                size="xs"
                                placeholder="Select a channel"
                                data={
                                    slackChannels?.map((channel) => ({
                                        value: channel.id,
                                        label: channel.name,
                                    })) ?? []
                                }
                                onChange={(value) => {
                                    // eslint-disable-next-line no-console
                                    console.log(value);
                                }}
                            />
                        </Stack>
                    </Stack>
                </Stack>
            </Box>

            <Box>
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
            </Box>
        </SettingsGridCard>
    );
};

export default SlackSettingsPanel;
