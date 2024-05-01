import { slackRequiredScopes, type SlackSettings } from '@lightdash/common';
import {
    Alert,
    Anchor,
    Avatar,
    Badge,
    Box,
    Button,
    Flex,
    Group,
    Loader,
    Select,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconAlertCircle,
    IconHelpCircle,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import intersection from 'lodash/intersection';
import { useEffect, type FC } from 'react';
import {
    useDeleteSlack,
    useGetSlack,
    useSlackChannels,
    useUpdateSlackNotificationChannelMutation,
} from '../../../hooks/slack/useSlack';
import { useApp } from '../../../providers/AppProvider';
import slackSvg from '../../../svgs/slack.svg';
import MantineIcon from '../../common/MantineIcon';
import { SettingsGridCard } from '../../common/Settings/SettingsCard';

export const hasRequiredScopes = (slackSettings: SlackSettings) => {
    return (
        intersection(slackSettings.scopes, slackRequiredScopes).length ===
        slackRequiredScopes.length
    );
};

const SLACK_INSTALL_URL = `/api/v1/slack/install/`;

const SlackSettingsPanel: FC = () => {
    const { data, isError, isInitialLoading } = useGetSlack();
    const isValidSlack = data?.slackTeamName !== undefined && !isError;
    const { health } = useApp();
    const { data: slackChannels, isInitialLoading: isLoadingSlackChannels } =
        useSlackChannels({
            enabled: isValidSlack,
        });
    const { mutate: deleteSlack } = useDeleteSlack();
    const { mutate: updateNotificationChannel } =
        useUpdateSlackNotificationChannelMutation();

    const form = useForm<{ notificationChannel: string | null }>({
        initialValues: {
            notificationChannel: null,
        },
    });

    const { setFieldValue } = form;

    useEffect(() => {
        if (data?.notificationChannel) {
            setFieldValue('notificationChannel', data.notificationChannel);
        }
    }, [data?.notificationChannel, setFieldValue]);

    if (isInitialLoading) {
        return <Loader />;
    }

    return (
        <SettingsGridCard>
            <Box>
                <Group spacing="sm">
                    <Avatar src={slackSvg} size="md" />
                    <Title order={4}>Slack</Title>
                </Group>
            </Box>

            <Stack>
                <Stack spacing="sm">
                    {isValidSlack && (
                        <Group spacing="xs">
                            <Text fw={500}>Added to the Slack workspace: </Text>{' '}
                            <Badge
                                radius="xs"
                                size="lg"
                                color="green"
                                w="fit-content"
                            >
                                <Text span fw={500}>
                                    {data.slackTeamName}
                                </Text>
                            </Badge>
                        </Group>
                    )}

                    <Text color="dimmed" fz="xs">
                        Sharing in Slack allows you to unfurl{' '}
                        {health.data?.siteName} URLs and schedule deliveries to
                        specific people or channels within your Slack workspace.{' '}
                        <Anchor
                            href={`${health.data?.siteHelpdeskUrl}/guides/sharing-in-slack`}
                        >
                            View docs
                        </Anchor>
                    </Text>

                    <Select
                        label={
                            <Group spacing="two" mb="two">
                                <Text>Select a notification channel</Text>
                                <Tooltip
                                    multiline
                                    maw={250}
                                    label="Choose a channel where to send notifications to every time a scheduled delivery fails. You have to add this Slack App to this channel to enable notifications"
                                >
                                    <MantineIcon icon={IconHelpCircle} />
                                </Tooltip>
                            </Group>
                        }
                        disabled={isLoadingSlackChannels}
                        size="xs"
                        placeholder="Select a channel"
                        searchable
                        clearable
                        nothingFound="No channels found"
                        defaultValue={form.values.notificationChannel}
                        data={
                            slackChannels?.map((channel) => ({
                                value: channel.id,
                                label: channel.name,
                            })) ?? []
                        }
                        {...form.getInputProps('notificationChannel')}
                        onChange={(value) => {
                            setFieldValue('notificationChannel', value);
                            updateNotificationChannel({ channelId: value });
                        }}
                    />
                </Stack>

                {isValidSlack ? (
                    <Stack align="end">
                        <Group>
                            <Button
                                size="xs"
                                component="a"
                                target="_blank"
                                variant="default"
                                href={SLACK_INSTALL_URL}
                                leftIcon={<MantineIcon icon={IconRefresh} />}
                            >
                                Reinstall
                            </Button>
                            <Button
                                size="xs"
                                px="xs"
                                color="red"
                                variant="outline"
                                onClick={() => deleteSlack(undefined)}
                                leftIcon={<MantineIcon icon={IconTrash} />}
                            >
                                Delete
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
                            size="xs"
                            component="a"
                            target="_blank"
                            color="blue"
                            href={SLACK_INSTALL_URL}
                        >
                            Add to Slack
                        </Button>
                    </Flex>
                )}
            </Stack>
        </SettingsGridCard>
    );
};

export default SlackSettingsPanel;
