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
    Divider,
    Flex,
    Group,
    Loader,
    Stack,
    Switch,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import {
    IconAlertCircle,
    IconDeviceFloppy,
    IconHelpCircle,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import { useEffect, useMemo, type FC } from 'react';
import { Link } from 'react-router';
import { z } from 'zod';
import { useAiAgentAdminAgents } from '../../../ee/features/aiCopilot/hooks/useAiAgentAdmin';
import { useAiOrganizationSettings } from '../../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';
import {
    useDeleteSlack,
    useGetSlack,
    useUpdateSlackAppCustomSettingsMutation,
} from '../../../hooks/slack/useSlack';
import { useActiveProjectUuid } from '../../../hooks/useActiveProject';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import slackSvg from '../../../svgs/slack.svg';
import Callout from '../../common/Callout';
import { default as MantineIcon } from '../../common/MantineIcon';
import { SettingsGridCard } from '../../common/Settings/SettingsCard';
import { SlackChannelSelect } from '../../common/SlackChannelSelect';
import { ProjectSelect } from './ProjectSelect';

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
    aiMultiAgentProjectUuids: z.array(z.string().uuid()).nullable().optional(),
    unfurlsEnabled: z.boolean().optional(),
});

const SlackSettingsPanel: FC = () => {
    const { activeProjectUuid } = useActiveProjectUuid();
    const aiOrganizationSettingsQuery = useAiOrganizationSettings();
    const { data: aiCopilotFlag } = useServerFeatureFlag(
        CommercialFeatureFlags.AiCopilot,
    );
    const { data: slackInstallation, isInitialLoading } = useGetSlack();
    const organizationHasSlack = !!slackInstallation?.organizationUuid;
    const isAiCopilotEnabledOrTrial =
        !!aiCopilotFlag?.enabled ||
        !!aiOrganizationSettingsQuery.data?.isCopilotEnabled ||
        !!aiOrganizationSettingsQuery.data?.isTrial;

    const { mutate: deleteSlack } = useDeleteSlack();
    const { mutate: updateCustomSettings } =
        useUpdateSlackAppCustomSettingsMutation();

    const { data: aiAgents } = useAiAgentAdminAgents({
        enabled: organizationHasSlack && isAiCopilotEnabledOrTrial,
    });

    const form = useForm<SlackAppCustomSettings>({
        initialValues: {
            notificationChannel: null,
            appProfilePhotoUrl: null,
            slackChannelProjectMappings: [],
            aiThreadAccessConsent: false,
            aiRequireOAuth: false,
            aiMultiAgentChannelId: undefined,
            aiMultiAgentProjectUuids: null,
            unfurlsEnabled: true,
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
            aiMultiAgentProjectUuids:
                slackInstallation.aiMultiAgentProjectUuids ?? null,
            unfurlsEnabled: slackInstallation.unfurlsEnabled ?? true,
        };

        if (form.initialized) {
            form.setInitialValues(initialValues);
            form.setValues(initialValues);
        } else {
            form.initialize(initialValues);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slackInstallation]);

    const conflictingAgents = useMemo(() => {
        const channelId = form.values.aiMultiAgentChannelId;
        if (!channelId || !aiAgents) return [];
        return aiAgents.filter((agent) =>
            agent.integrations.some(
                (integration) =>
                    integration.type === 'slack' &&
                    integration.channelId === channelId,
            ),
        );
    }, [form.values.aiMultiAgentChannelId, aiAgents]);

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
            <Stack gap="sm">
                <Box>
                    <Group gap="sm">
                        <Avatar src={slackSvg} size="md" />
                        <Title order={4}>Slack</Title>
                    </Group>
                </Box>
            </Stack>

            <Stack>
                <Stack gap="sm">
                    {organizationHasSlack && (
                        <Group gap="xs">
                            <Text fw={500}>Added to the Slack workspace: </Text>{' '}
                            <Badge
                                radius="xs"
                                size="lg"
                                color="green"
                                w="fit-content"
                            >
                                <Text span fw={500} fz="inherit">
                                    {slackInstallation.slackTeamName}
                                </Text>
                            </Badge>
                        </Group>
                    )}

                    <Text c="dimmed" fz="xs">
                        Sharing in Slack allows you to unfurl Lightdash URLs and
                        schedule deliveries to specific people or channels
                        within your Slack workspace.{' '}
                        <Anchor
                            fz="inherit"
                            href="https://docs.lightdash.com/references/slack-integration"
                        >
                            View docs
                        </Anchor>
                    </Text>
                </Stack>

                {organizationHasSlack ? (
                    <form onSubmit={handleSubmit}>
                        <Stack gap="sm">
                            <SlackChannelSelect
                                label={
                                    <Group gap="two" mb={2}>
                                        <Text fz="inherit">
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
                            <Group gap="sm">
                                <Avatar
                                    size="lg"
                                    src={form.values?.appProfilePhotoUrl}
                                    radius="md"
                                    bg="ldGray.1"
                                />
                                <TextInput
                                    flex={1}
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
                            <Stack gap="sm">
                                <Divider mt="sm" />
                                <Title order={5} fw={600}>
                                    Unfurling
                                </Title>
                                <Group gap="two">
                                    <Title order={6} fw={500}>
                                        Link previews
                                    </Title>
                                    <Tooltip
                                        multiline
                                        maw={280}
                                        label="When enabled, Lightdash posts chart and dashboard previews when links are shared in Slack. Previews are rendered as the user who installed the Slack app, so any queries they trigger are attributed to that user. Disable to stop posting previews."
                                    >
                                        <MantineIcon icon={IconHelpCircle} />
                                    </Tooltip>
                                </Group>
                                <Switch
                                    label="Enable link unfurls"
                                    checked={form.values.unfurlsEnabled ?? true}
                                    onChange={(event) => {
                                        setFieldValue(
                                            'unfurlsEnabled',
                                            event.currentTarget.checked,
                                        );
                                    }}
                                />
                            </Stack>
                            {isAiCopilotEnabledOrTrial && (
                                <Stack gap="sm">
                                    <Divider mt="sm" />
                                    <Title order={5} fw={600}>
                                        AI in Slack
                                    </Title>
                                    <Group gap="two">
                                        <Title order={6} fw={500}>
                                            AI Agents thread access consent
                                        </Title>

                                        <Tooltip
                                            multiline
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
                                            fz="inherit"
                                        >
                                            here
                                        </Anchor>
                                        .
                                    </Text>

                                    <Stack gap="sm">
                                        <Group gap="two">
                                            <Title order={6} fw={500}>
                                                AI Agents OAuth requirement
                                            </Title>

                                            <Tooltip
                                                multiline
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

                                    <Stack gap="xs">
                                        <Group gap="xs">
                                            <Title order={6} fw={500}>
                                                Multi-agent channel
                                            </Title>

                                            <Tooltip
                                                multiline
                                                maw={250}
                                                label="Select a channel where users can interact with any AI agent (excluding from preview projects). When users start a thread in this channel, they'll see a dropdown to select which agent to use."
                                            >
                                                <MantineIcon
                                                    icon={IconHelpCircle}
                                                />
                                            </Tooltip>
                                        </Group>

                                        <Text c="dimmed" fz="xs">
                                            Lightdash picks the best agent
                                            automatically.
                                        </Text>

                                        <SlackChannelSelect
                                            includeGroups
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
                                            placeholder="Select a channel (optional)"
                                        />

                                        {conflictingAgents.length > 0 && (
                                            <Callout
                                                variant="warning"
                                                title="Channel already in use by an AI agent"
                                            >
                                                <Text fz="xs">
                                                    Setting this as the
                                                    multi-agent channel will
                                                    override the channel
                                                    configuration on the
                                                    following{' '}
                                                    {conflictingAgents.length >
                                                    1
                                                        ? 'agents'
                                                        : 'agent'}
                                                    :
                                                </Text>
                                                <Stack gap={2} mt="xs">
                                                    {conflictingAgents.map(
                                                        (agent) => (
                                                            <Anchor
                                                                key={agent.uuid}
                                                                component={Link}
                                                                to={`/projects/${agent.projectUuid}/ai-agents/${agent.uuid}/edit`}
                                                                fz="xs"
                                                            >
                                                                {agent.name}
                                                            </Anchor>
                                                        ),
                                                    )}
                                                </Stack>
                                            </Callout>
                                        )}

                                        {form.values.aiMultiAgentChannelId && (
                                            <Stack gap="xs">
                                                <Switch
                                                    label="Allow all project agents to appear"
                                                    checked={
                                                        form.values
                                                            .aiMultiAgentProjectUuids ===
                                                        null
                                                    }
                                                    onChange={(event) => {
                                                        setFieldValue(
                                                            'aiMultiAgentProjectUuids',
                                                            event.currentTarget
                                                                .checked
                                                                ? null
                                                                : [],
                                                        );
                                                    }}
                                                />

                                                {form.values
                                                    .aiMultiAgentProjectUuids !==
                                                    null && (
                                                    <ProjectSelect
                                                        value={
                                                            form.values
                                                                .aiMultiAgentProjectUuids ??
                                                            []
                                                        }
                                                        onChange={(value) => {
                                                            setFieldValue(
                                                                'aiMultiAgentProjectUuids',
                                                                value.length > 0
                                                                    ? value
                                                                    : [],
                                                            );
                                                        }}
                                                    />
                                                )}
                                            </Stack>
                                        )}
                                    </Stack>
                                </Stack>
                            )}
                        </Stack>
                        <Stack align="end" mt="xl">
                            <Group gap="sm">
                                <Group gap="xs">
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
                                        leftSection={
                                            <MantineIcon icon={IconRefresh} />
                                        }
                                    >
                                        Reinstall
                                    </Button>
                                </Group>
                                <Button
                                    size="xs"
                                    type="submit"
                                    leftSection={
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
