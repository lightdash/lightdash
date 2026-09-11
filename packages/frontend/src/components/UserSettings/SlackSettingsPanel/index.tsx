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
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconAlertCircle,
    IconDeviceFloppy,
    IconHelpCircle,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { useEffect, useMemo, type FC } from 'react';
import { Link } from 'react-router';
import { z } from 'zod';
import { useAiAgentAdminAgents } from '../../../ee/features/aiCopilot/hooks/useAiAgentAdmin';
import {
    useAiOrganizationAdminSettings,
    useUpdateAiOrganizationSettings,
} from '../../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';
import {
    useDeleteSlack,
    useGetSlack,
    useUpdateSlackAppCustomSettingsMutation,
} from '../../../hooks/slack/useSlack';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import slackSvg from '../../../svgs/slack.svg';
import Callout from '../../common/Callout';
import { default as MantineIcon } from '../../common/MantineIcon';
import { SettingsGridCard } from '../../common/Settings/SettingsCard';
import { SlackChannelSelect } from '../../common/SlackChannelSelect';
import { ProjectSelect } from './ProjectSelect';
import { SlackSettingRow } from './SlackSettingRow';

const SLACK_INSTALL_URL = `/api/v1/slack/install/`;

type SlackSettingsFormValues = SlackAppCustomSettings & {
    requireExplicitSlackChannelLinking: boolean;
};

const formSchema = z.object({
    notificationChannel: z.string().min(1, 'Channel is required').nullable(),
    appProfilePhotoUrl: z
        .string()
        .url({ message: 'Enter a valid URL' })
        .max(2048, { message: 'URL must be 2048 characters or fewer' })
        .nullable(),
    slackChannelProjectMappings: z.array(
        z.object({
            projectUuid: z
                .string({ message: 'You must select a project' })
                .uuid({ message: 'Invalid project' }),
            slackChannelId: z
                .string({
                    message: 'You must select a Slack channel',
                })
                .min(1, 'You must select a Slack channel'),
            availableTags: z
                .array(z.string().min(1, 'Tag cannot be empty'))
                .nullable(),
        }),
    ),
    aiThreadAccessConsent: z.boolean().optional(),
    aiRequireOAuth: z.boolean().optional(),
    aiLinksOnly: z.boolean().optional(),
    aiMultiAgentChannelId: z.string().min(1, 'Channel is required').optional(),
    aiMultiAgentProjectUuids: z.array(z.string().uuid()).nullable().optional(),
    unfurlsEnabled: z.boolean().optional(),
    aiAgentsEnabled: z.boolean().optional(),
    requireExplicitSlackChannelLinking: z.boolean(),
});

const SlackSettingsPanel: FC = () => {
    const aiOrganizationSettingsQuery = useAiOrganizationAdminSettings();
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
    const { mutate: updateCustomSettings, isLoading: isUpdatingSlackSettings } =
        useUpdateSlackAppCustomSettingsMutation();
    const {
        mutate: updateAiOrganizationSettings,
        isLoading: isUpdatingAiOrganizationSettings,
    } = useUpdateAiOrganizationSettings();

    const { data: aiAgents } = useAiAgentAdminAgents({
        enabled: organizationHasSlack && isAiCopilotEnabledOrTrial,
    });

    const form = useForm<SlackSettingsFormValues>({
        initialValues: {
            notificationChannel: null,
            appProfilePhotoUrl: null,
            slackChannelProjectMappings: [],
            aiThreadAccessConsent: false,
            aiRequireOAuth: false,
            aiLinksOnly: false,
            aiMultiAgentChannelId: undefined,
            aiMultiAgentProjectUuids: null,
            unfurlsEnabled: true,
            aiAgentsEnabled: true,
            requireExplicitSlackChannelLinking: false,
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
            aiLinksOnly: slackInstallation.aiLinksOnly ?? false,
            aiMultiAgentChannelId:
                slackInstallation.aiMultiAgentChannelId ?? undefined,
            aiMultiAgentProjectUuids:
                slackInstallation.aiMultiAgentProjectUuids ?? null,
            unfurlsEnabled: slackInstallation.unfurlsEnabled ?? true,
            aiAgentsEnabled: slackInstallation.aiAgentsEnabled ?? true,
            requireExplicitSlackChannelLinking:
                aiOrganizationSettingsQuery.data
                    ?.requireExplicitSlackChannelLinking ?? false,
        };

        if (form.initialized) {
            form.setInitialValues(initialValues);
            form.setValues(initialValues);
        } else {
            form.initialize(initialValues);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slackInstallation, aiOrganizationSettingsQuery.data]);

    const aiAgentsDisabled = !(form.values.aiAgentsEnabled ?? true);

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

    if (
        isInitialLoading ||
        aiOrganizationSettingsQuery.isInitialLoading ||
        (organizationHasSlack && !form.initialized)
    ) {
        return <Loader />;
    }

    const handleSubmit = onSubmit((args) => {
        if (organizationHasSlack) {
            const { requireExplicitSlackChannelLinking, ...slackSettings } =
                args;

            updateCustomSettings(slackSettings);

            if (
                requireExplicitSlackChannelLinking !==
                (aiOrganizationSettingsQuery.data
                    ?.requireExplicitSlackChannelLinking ?? false)
            ) {
                updateAiOrganizationSettings({
                    requireExplicitSlackChannelLinking,
                });
            }
        }
    });

    return (
        <SettingsGridCard>
            <Stack gap="sm">
                <Box>
                    <Group gap="sm">
                        <Avatar src={slackSvg} size="md" />
                        <Title order={5}>Slack</Title>
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
                                <Text span fw={500}>
                                    {slackInstallation.slackTeamName}
                                </Text>
                            </Badge>
                        </Group>
                    )}

                    <Text c="dimmed" fz="xs">
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
                        <Stack gap="sm">
                            <SlackChannelSelect
                                label={
                                    <Group gap="two" mb={2}>
                                        <Text>
                                            Select a notification channel
                                        </Text>
                                        <Tooltip
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
                                <Title order={5}>Unfurling</Title>
                                <SlackSettingRow
                                    title="Link previews"
                                    description="Post chart and dashboard previews when Lightdash links are shared in Slack. Previews run as the user who installed the Slack app, so their queries are attributed to that user."
                                    checked={form.values.unfurlsEnabled ?? true}
                                    onChange={(checked) =>
                                        setFieldValue('unfurlsEnabled', checked)
                                    }
                                />
                            </Stack>
                            {isAiCopilotEnabledOrTrial && (
                                <Stack gap="sm">
                                    <Divider mt="sm" />
                                    <Title order={5}>AI in Slack</Title>
                                    <Stack gap={0}>
                                        <SlackSettingRow
                                            title="AI Agents in Slack"
                                            description="Let people use AI Agents from Slack. Turning this off keeps agents available in Lightdash; scheduled deliveries, alerts and link previews keep working."
                                            checked={
                                                form.values.aiAgentsEnabled ??
                                                true
                                            }
                                            onChange={(checked) =>
                                                setFieldValue(
                                                    'aiAgentsEnabled',
                                                    checked,
                                                )
                                            }
                                        />
                                        <SlackSettingRow
                                            title="AI Agents thread access consent"
                                            description="Let AI Agents read earlier messages in a thread when someone mentions the bot there, so they have the conversation as context."
                                            disabled={aiAgentsDisabled}
                                            checked={
                                                form.values
                                                    .aiThreadAccessConsent ??
                                                false
                                            }
                                            onChange={(checked) =>
                                                setFieldValue(
                                                    'aiThreadAccessConsent',
                                                    checked,
                                                )
                                            }
                                        />
                                        <SlackSettingRow
                                            title="AI Agents OAuth requirement"
                                            description="People must sign in to Lightdash with OAuth before using AI Agents from Slack, so their requests run with their own permissions."
                                            disabled={aiAgentsDisabled}
                                            checked={
                                                form.values.aiRequireOAuth ??
                                                false
                                            }
                                            onChange={(checked) =>
                                                setFieldValue(
                                                    'aiRequireOAuth',
                                                    checked,
                                                )
                                            }
                                        />
                                        <SlackSettingRow
                                            title="Links only, no data in Slack"
                                            description="AI Agents never post query results into Slack: no chart images, CSV files or values in the reply. People open results in Lightdash, where their own permissions apply. For a strict guarantee, also turn off data access on the agent."
                                            disabled={aiAgentsDisabled}
                                            checked={
                                                form.values.aiLinksOnly ?? false
                                            }
                                            onChange={(checked) =>
                                                setFieldValue(
                                                    'aiLinksOnly',
                                                    checked,
                                                )
                                            }
                                        />
                                        <SlackSettingRow
                                            title="Automatic channel linking"
                                            description="Mentioning the bot in a channel with no agent yet links an agent to it automatically. Turn this off to add channels only from Lightdash."
                                            disabled={
                                                aiAgentsDisabled ||
                                                isUpdatingAiOrganizationSettings
                                            }
                                            checked={
                                                !form.values
                                                    .requireExplicitSlackChannelLinking
                                            }
                                            onChange={(checked) =>
                                                setFieldValue(
                                                    'requireExplicitSlackChannelLinking',
                                                    !checked,
                                                )
                                            }
                                        />
                                    </Stack>

                                    <Stack gap="xs">
                                        <Group gap="xs">
                                            <Title order={6} fw={500}>
                                                Multi-agent channel
                                            </Title>

                                            <Tooltip
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
                                            disabled={aiAgentsDisabled}
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
                                                    disabled={aiAgentsDisabled}
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
                                                        disabled={
                                                            aiAgentsDisabled
                                                        }
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
                                    loading={
                                        isUpdatingSlackSettings ||
                                        isUpdatingAiOrganizationSettings
                                    }
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
