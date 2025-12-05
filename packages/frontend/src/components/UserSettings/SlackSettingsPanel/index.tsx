import {
    CommercialFeatureFlags,
    type SlackAppCustomSettings,
} from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Anchor,
    Avatar,
    Badge,
    Box,
    Button,
    Flex,
    Group,
    Loader,
    Stack,
    Switch,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import {
    IconAlertCircle,
    IconDeviceFloppy,
    IconHelpCircle,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import { Link } from 'react-router';
import { z } from 'zod';
import useHealth from '../../../hooks/health/useHealth';
import {
    useDeleteSlack,
    useGetSlack,
    useUpdateSlackAppCustomSettingsMutation,
} from '../../../hooks/slack/useSlack';
import { useActiveProjectUuid } from '../../../hooks/useActiveProject';
import { useFeatureFlag } from '../../../hooks/useFeatureFlagEnabled';
import slackSvg from '../../../svgs/slack.svg';
import { BetaBadge } from '../../common/BetaBadge';
import { ComingSoonBadge } from '../../common/ComingSoonBadge';
import { default as MantineIcon } from '../../common/MantineIcon';
import { SettingsGridCard } from '../../common/Settings/SettingsCard';
import { SlackChannelSelect } from '../../common/SlackChannelSelect';

const SLACK_INSTALL_URL = `/api/v1/slack/install/`;

const formSchema = z.object({
    notificationChannel: z.string().min(1).nullable(),
    appProfilePhotoUrl: z.string().url().nullable(),
    slackChannelProjectMappings: z.array(
        z.object({
            projectUuid: z
                .string({ message: 'You must select a project' })
                .uuid({ message: 'Invalid project' }),
            slackChannelId: z
                .string({
                    message: 'You must select a Slack channel',
                })
                .min(1),
            availableTags: z.array(z.string().min(1)).nullable(),
        }),
    ),
    aiThreadAccessConsent: z.boolean().optional(),
    aiRequireOAuth: z.boolean().optional(),
    aiMultiAgentChannelId: z.string().min(1).optional(),
});

const SlackSettingsPanel: FC = () => {
    const { activeProjectUuid } = useActiveProjectUuid();
    const { data: aiCopilotFlag } = useFeatureFlag(
        CommercialFeatureFlags.AiCopilot,
    );
    const { data: health } = useHealth();
    const { data: slackInstallation, isInitialLoading } = useGetSlack();
    const organizationHasSlack = !!slackInstallation?.organizationUuid;

    const isSlackMultiAgentChannelEnabled =
        health?.slack?.multiAgentChannelEnabled ?? false;

    const { mutate: deleteSlack } = useDeleteSlack();
    const { mutate: updateCustomSettings } =
        useUpdateSlackAppCustomSettingsMutation();

    const form = useForm<SlackAppCustomSettings>({
        initialValues: {
            notificationChannel: null,
            appProfilePhotoUrl: null,
            slackChannelProjectMappings: [],
            aiThreadAccessConsent: false,
            aiRequireOAuth: false,
            aiMultiAgentChannelId: undefined,
        },
        validate: zodResolver(formSchema),
    });

    const { setFieldValue, onSubmit } = form;

    useEffect(() => {
        if (!slackInstallation) return;

        const initialValues = {
            notificationChannel: slackInstallation.notificationChannel ?? null,
            appProfilePhotoUrl: slackInstallation.appProfilePhotoUrl ?? null,
            slackChannelProjectMappings:
                slackInstallation.slackChannelProjectMappings ?? [],
            aiThreadAccessConsent:
                slackInstallation.aiThreadAccessConsent ?? false,
            aiRequireOAuth: slackInstallation.aiRequireOAuth ?? false,
            aiMultiAgentChannelId:
                slackInstallation.aiMultiAgentChannelId ?? undefined,
        };

        if (form.initialized) {
            form.setInitialValues(initialValues);
            form.setValues(initialValues);
        } else {
            form.initialize(initialValues);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slackInstallation]);

    if (isInitialLoading || (organizationHasSlack && !form.initialized)) {
        return <Loader />;
    }

    const handleSubmit = onSubmit((args) => {
        if (organizationHasSlack) {
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
                    {organizationHasSlack && (
                        <Group spacing="xs">
                            <Text fw={500}>Added to the Slack workspace: </Text>{' '}
                            <Badge
                                radius="xs"
                                size="lg"
                                color="green"
                                w="fit-content"
                            >
                                <Text span fw={500}>
                                    {slackInstallation.slackTeamName}
                                </Text>
                            </Badge>
                        </Group>
                    )}

                    <Text color="dimmed" fz="xs">
                        Sharing in Slack allows you to unfurl Lightdash URLs and
                        schedule deliveries to specific people or channels
                        within your Slack workspace.{' '}
                        <Anchor href="https://docs.lightdash.com/references/slack-integration">
                            View docs
                        </Anchor>
                    </Text>
                </Stack>

                {organizationHasSlack ? (
                    <form onSubmit={handleSubmit}>
                        <Stack spacing="sm">
                            <SlackChannelSelect
                                label={
                                    <Group spacing="two" mb="two">
                                        <Text>
                                            Select a notification channel
                                        </Text>
                                        <Tooltip
                                            multiline
                                            variant="xs"
                                            maw={250}
                                            label="Choose a channel where to send notifications to every time a scheduled delivery fails. You have to add this Slack App to this channel to enable notifications"
                                        >
                                            <MantineIcon
                                                icon={IconHelpCircle}
                                            />
                                        </Tooltip>
                                    </Group>
                                }
                                value={form.values.notificationChannel}
                                onChange={(value) => {
                                    setFieldValue(
                                        'notificationChannel',
                                        value ?? null,
                                    );
                                }}
                                placeholder="Select a channel"
                            />
                            <Title order={6} fw={500}>
                                Slack bot avatar
                            </Title>
                            <Group spacing="xl">
                                <Avatar
                                    size="lg"
                                    src={form.values?.appProfilePhotoUrl}
                                    radius="md"
                                    bg="ldGray.1"
                                />
                                <TextInput
                                    sx={{ flexGrow: 1 }}
                                    label="Profile photo URL"
                                    size="xs"
                                    placeholder="https://lightdash.cloud/photo.jpg"
                                    type="url"
                                    disabled={!organizationHasSlack}
                                    {...form.getInputProps(
                                        'appProfilePhotoUrl',
                                    )}
                                    value={
                                        form.values.appProfilePhotoUrl ??
                                        undefined
                                    }
                                />
                            </Group>
                            {aiCopilotFlag?.enabled && (
                                <Stack spacing="sm">
                                    <Group spacing="two">
                                        <Title order={6} fw={500}>
                                            AI Agents thread access consent
                                        </Title>

                                        <Tooltip
                                            multiline
                                            variant="xs"
                                            maw={250}
                                            label="The longer the thread, the more context the AI Agents will have to work with."
                                        >
                                            <MantineIcon
                                                icon={IconHelpCircle}
                                            />
                                        </Tooltip>
                                    </Group>

                                    <Text c="dimmed" fz="xs">
                                        Allow the AI Agents to access thread
                                        messages when a user mentions the bot in
                                        a thread.
                                    </Text>

                                    <Switch
                                        label="Allow AI to access thread messages"
                                        checked={
                                            form.values.aiThreadAccessConsent ??
                                            false
                                        }
                                        onChange={(event) => {
                                            setFieldValue(
                                                'aiThreadAccessConsent',
                                                event.currentTarget.checked,
                                            );
                                        }}
                                    />
                                    <Text fz="xs" c="dimmed">
                                        Configure which channels your AI Agents
                                        can access{' '}
                                        <Anchor
                                            component={Link}
                                            to={`/projects/${activeProjectUuid}/ai-agents`}
                                        >
                                            here
                                        </Anchor>
                                        .
                                    </Text>

                                    <Stack spacing="sm">
                                        <Group spacing="two">
                                            <Title order={6} fw={500}>
                                                AI Agents OAuth requirement
                                            </Title>

                                            <Tooltip
                                                multiline
                                                variant="xs"
                                                maw={250}
                                                label="When enabled, users must authenticate with OAuth to use AI Agent features."
                                            >
                                                <MantineIcon
                                                    icon={IconHelpCircle}
                                                />
                                            </Tooltip>
                                        </Group>

                                        <Switch
                                            label="Require OAuth for AI Agent"
                                            checked={form.values.aiRequireOAuth}
                                            onChange={(event) => {
                                                setFieldValue(
                                                    'aiRequireOAuth',
                                                    event.currentTarget.checked,
                                                );
                                            }}
                                        />
                                    </Stack>

                                    <Stack spacing="xs">
                                        <Group spacing="xs">
                                            <Title order={6} fw={500}>
                                                Multi-agent channel
                                            </Title>

                                            {isSlackMultiAgentChannelEnabled && (
                                                <Tooltip
                                                    multiline
                                                    variant="xs"
                                                    maw={250}
                                                    label="Select a channel where users can interact with any AI agent (excluding from preview projects). When users start a thread in this channel, they'll see a dropdown to select which agent to use."
                                                >
                                                    <MantineIcon
                                                        icon={IconHelpCircle}
                                                    />
                                                </Tooltip>
                                            )}
                                            {isSlackMultiAgentChannelEnabled ? (
                                                <BetaBadge />
                                            ) : (
                                                <ComingSoonBadge />
                                            )}
                                        </Group>

                                        <Text c="dimmed" fz="xs">
                                            In this channel, users starting a
                                            thread will see a dropdown to choose
                                            which AI agent to chat with.
                                        </Text>

                                        <SlackChannelSelect
                                            value={
                                                form.values
                                                    .aiMultiAgentChannelId ??
                                                null
                                            }
                                            onChange={(value) => {
                                                setFieldValue(
                                                    'aiMultiAgentChannelId',
                                                    value ?? undefined,
                                                );
                                            }}
                                            disabled={
                                                !isSlackMultiAgentChannelEnabled
                                            }
                                            placeholder={
                                                isSlackMultiAgentChannelEnabled
                                                    ? 'Select a channel (optional)'
                                                    : 'Feature not available'
                                            }
                                        />
                                    </Stack>
                                </Stack>
                            )}
                        </Stack>
                        <Stack align="end" mt="xl">
                            <Group spacing="sm">
                                <Group spacing="xs">
                                    <ActionIcon
                                        variant="default"
                                        size="md"
                                        onClick={() => deleteSlack(undefined)}
                                    >
                                        <MantineIcon
                                            icon={IconTrash}
                                            color="red"
                                        />
                                    </ActionIcon>
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
                                </Group>
                                <Button
                                    size="xs"
                                    type="submit"
                                    leftIcon={
                                        <MantineIcon icon={IconDeviceFloppy} />
                                    }
                                >
                                    Save
                                </Button>
                            </Group>

                            {organizationHasSlack &&
                                !slackInstallation.hasRequiredScopes && (
                                    <Alert
                                        color="yellow"
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
