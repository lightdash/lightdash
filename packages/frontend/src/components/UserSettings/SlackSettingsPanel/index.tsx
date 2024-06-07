import {
    slackRequiredScopes,
    type SlackAppCustomSettings,
    type SlackSettings,
} from '@lightdash/common';
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
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconAlertCircle,
    IconDeviceFloppy,
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
    useUpdateSlackAppCustomSettingsMutation,
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

const SLACK_INSTALL_URL = `/api/v1/slack/install/`;

const SlackSettingsPanel: FC = () => {
    const { data, isError, isInitialLoading } = useGetSlack();
    const isValidSlack = data?.slackTeamName !== undefined && !isError;
    const { data: slackChannels, isInitialLoading: isLoadingSlackChannels } =
        useSlackChannels({
            enabled: isValidSlack,
        });
    const { mutate: deleteSlack } = useDeleteSlack();
    const { mutate: updateCustomSettings } =
        useUpdateSlackAppCustomSettingsMutation();

    const form = useForm<SlackAppCustomSettings>({
        initialValues: {
            notificationChannel: null,
            appProfilePhotoUrl: null,
        },
    });

    const { setFieldValue, onSubmit } = form;

    useEffect(() => {
        if (data?.notificationChannel) {
            setFieldValue('notificationChannel', data.notificationChannel);
        }

        if (data?.appProfilePhotoUrl) {
            setFieldValue('appProfilePhotoUrl', data.appProfilePhotoUrl);
        }
    }, [data?.appProfilePhotoUrl, data?.notificationChannel, setFieldValue]);

    if (isInitialLoading) {
        return <Loader />;
    }

    const handleSubmit = onSubmit((args) => {
        if (isValidSlack) {
            updateCustomSettings(args);
        }
    });

    return (
        <SettingsGridCard>
            <Stack spacing="sm">
                <Box>
                    <Group spacing="sm">
                        <Avatar src={slackSvg} size="md" />
                        <Title order={4}>Slack</Title>
                    </Group>
                </Box>
            </Stack>

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
                        Sharing in Slack allows you to unfurl Lightdash URLs and
                        schedule deliveries to specific people or channels
                        within your Slack workspace.{' '}
                        <Anchor href="https://docs.lightdash.com/guides/sharing-in-slack">
                            View docs
                        </Anchor>
                    </Text>
                </Stack>

                {isValidSlack ? (
                    <>
                        <form onSubmit={handleSubmit}>
                            <Stack spacing="sm">
                                <TextInput
                                    label="Enter the URL of an profile photo for your Slack App"
                                    size="xs"
                                    placeholder="https://my-photo.com/photo.jpg"
                                    type="url"
                                    disabled={!isValidSlack}
                                    {...form.getInputProps(
                                        'appProfilePhotoUrl',
                                    )}
                                    value={
                                        form.values.appProfilePhotoUrl ??
                                        undefined
                                    }
                                />
                                <Stack justify="center">
                                    <Title order={6}>Profile photo</Title>
                                    <Avatar
                                        src={form.values?.appProfilePhotoUrl}
                                        size="xl"
                                        radius="md"
                                        bg="gray.1"
                                    />
                                </Stack>
                                <Select
                                    label={
                                        <Group spacing="two" mb="two">
                                            <Text>
                                                Select a notification channel
                                            </Text>
                                            <Tooltip
                                                multiline
                                                maw={250}
                                                label="Choose a channel where to send notifications to every time a scheduled delivery fails. You have to add this Slack App to this channel to enable notifications"
                                            >
                                                <MantineIcon
                                                    icon={IconHelpCircle}
                                                />
                                            </Tooltip>
                                        </Group>
                                    }
                                    disabled={isLoadingSlackChannels}
                                    size="xs"
                                    placeholder="Select a channel"
                                    searchable
                                    clearable
                                    nothingFound="No channels found"
                                    defaultValue={
                                        form.values.notificationChannel
                                    }
                                    data={
                                        slackChannels?.map((channel) => ({
                                            value: channel.id,
                                            label: channel.name,
                                        })) ?? []
                                    }
                                    {...form.getInputProps(
                                        'notificationChannel',
                                    )}
                                    onChange={(value) => {
                                        setFieldValue(
                                            'notificationChannel',
                                            value,
                                        );
                                    }}
                                />
                            </Stack>
                            <Stack align="end" mt="sm">
                                <Group>
                                    <Button
                                        size="xs"
                                        component="a"
                                        target="_blank"
                                        variant="default"
                                        href={SLACK_INSTALL_URL}
                                        leftIcon={
                                            <MantineIcon icon={IconRefresh} />
                                        }
                                    >
                                        Reinstall
                                    </Button>
                                    <Button
                                        size="xs"
                                        type="submit"
                                        leftIcon={
                                            <MantineIcon
                                                icon={IconDeviceFloppy}
                                            />
                                        }
                                    >
                                        Save
                                    </Button>
                                    <Button
                                        size="xs"
                                        px="xs"
                                        color="red"
                                        variant="outline"
                                        onClick={() => deleteSlack(undefined)}
                                        leftIcon={
                                            <MantineIcon icon={IconTrash} />
                                        }
                                    >
                                        Delete
                                    </Button>
                                </Group>

                                {data && !hasRequiredScopes(data) && (
                                    <Alert
                                        color="blue"
                                        icon={
                                            <MantineIcon
                                                icon={IconAlertCircle}
                                            />
                                        }
                                    >
                                        Your Slack integration is not up to
                                        date, you should reinstall the Slack
                                        integration to guarantee the best user
                                        experience.
                                    </Alert>
                                )}
                            </Stack>
                        </form>
                    </>
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
