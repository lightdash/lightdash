import {
    CommercialFeatureFlags,
    type SlackAppCustomSettings,
} from '@lightdash/common';
import {
    Anchor,
    Avatar,
    Box,
    Button,
    Divider,
    Group,
    Stack,
    Switch,
    Text,
    TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconDeviceFloppy, IconRefresh, IconTrash } from '@tabler/icons-react';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { useEffect, useMemo, type FC, type ReactNode } from 'react';
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
import EmptyStateLoader from '../../common/EmptyStateLoader';
import { default as MantineIcon } from '../../common/MantineIcon';
import {
    SettingRow,
    SettingsSection,
} from '../../common/Settings/SettingLayout';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { SlackChannelSelect } from '../../common/SlackChannelSelect';
import { ProjectSelect } from './ProjectSelect';
import { SlackMissingScopesAlert } from './SlackMissingScopesAlert';

const SLACK_INSTALL_URL = `/api/v1/slack/install/`;

const SLACK_DOCS_URL =
    'https://docs.lightdash.com/references/slack-integration';

const SwitchRow: FC<{
    title: string;
    description: string;
    checked: boolean;
    disabled?: boolean;
    onChange: (checked: boolean) => void;
    children?: ReactNode;
}> = ({
    title,
    description,
    checked,
    disabled = false,
    onChange,
    children,
}) => (
    <SettingRow
        title={title}
        description={description}
        control={
            <Switch
                aria-label={title}
                size="md"
                checked={checked}
                disabled={disabled}
                onChange={(event) => onChange(event.currentTarget.checked)}
            />
        }
    >
        {children}
    </SettingRow>
);

const SlackSection: FC<{ children: ReactNode }> = ({ children }) => (
    <SettingsSection
        label="Slack"
        description="Unfurl links and schedule deliveries to people or channels in your Slack workspace."
        titleAddon={
            <Anchor href={SLACK_DOCS_URL} fz="xs">
                View docs
            </Anchor>
        }
    >
        {children}
    </SettingsSection>
);

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
    aiMultiAgentRequireMention: z.boolean().optional(),
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
            aiMultiAgentRequireMention: false,
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
            aiMultiAgentRequireMention:
                slackInstallation.aiMultiAgentRequireMention ?? false,
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
        return (
            <SlackSection>
                <SettingsCard>
                    <EmptyStateLoader mih={60} />
                </SettingsCard>
            </SlackSection>
        );
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

    if (!organizationHasSlack) {
        return (
            <SlackSection>
                <SettingsCard>
                    <SettingRow
                        titlePrefix={<Avatar src={slackSvg} size="sm" alt="" />}
                        title="Not connected"
                        description="Add the app to your Slack workspace to get started."
                        control={
                            <Button
                                size="xs"
                                component="a"
                                target="_blank"
                                href={SLACK_INSTALL_URL}
                            >
                                Add to Slack
                            </Button>
                        }
                    />
                </SettingsCard>
            </SlackSection>
        );
    }

    return (
        <form onSubmit={handleSubmit}>
            <SlackSection>
                <SettingsCard>
                    <Stack gap="md">
                        <SettingRow
                            titlePrefix={
                                <Avatar src={slackSvg} size="sm" alt="" />
                            }
                            title={slackInstallation.slackTeamName}
                            description="Connected Slack workspace."
                            control={
                                <Group gap="xs">
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
                                    <Button
                                        size="xs"
                                        variant="subtle"
                                        color="red"
                                        leftSection={
                                            <MantineIcon icon={IconTrash} />
                                        }
                                        onClick={() => deleteSlack(undefined)}
                                    >
                                        Disconnect
                                    </Button>
                                </Group>
                            }
                        />
                        <SlackMissingScopesAlert
                            features={slackInstallation.features}
                        />
                        <Divider />
                        <SettingRow
                            title="Failure notifications"
                            description="Channel that gets a message every time a scheduled delivery fails. Add the Slack app to this channel to receive them."
                            control={
                                <Box w={{ base: '100%', sm: 260 }}>
                                    <SlackChannelSelect
                                        value={form.values.notificationChannel}
                                        onChange={(value) => {
                                            setFieldValue(
                                                'notificationChannel',
                                                value ?? null,
                                            );
                                        }}
                                        placeholder="Select a channel"
                                    />
                                </Box>
                            }
                        />
                        <Divider />
                        <SettingRow
                            title="Bot avatar"
                            description="Profile photo shown on messages the Slack app posts."
                            control={
                                <Group
                                    gap="sm"
                                    wrap="nowrap"
                                    w={{ base: '100%', sm: 260 }}
                                >
                                    <Avatar
                                        size="md"
                                        src={form.values?.appProfilePhotoUrl}
                                        radius="md"
                                        bg="ldGray.1"
                                    />
                                    <TextInput
                                        flex={1}
                                        aria-label="Profile photo URL"
                                        size="xs"
                                        placeholder="https://lightdash.cloud/photo.jpg"
                                        type="url"
                                        {...form.getInputProps(
                                            'appProfilePhotoUrl',
                                        )}
                                        value={
                                            form.values.appProfilePhotoUrl ??
                                            undefined
                                        }
                                    />
                                </Group>
                            }
                        />
                    </Stack>
                </SettingsCard>

                <SettingsCard>
                    <Stack gap="md">
                        <SwitchRow
                            title="Link previews"
                            description="Post chart and dashboard previews when links are shared. Previews run as the user who installed the app."
                            checked={form.values.unfurlsEnabled ?? true}
                            onChange={(checked) =>
                                setFieldValue('unfurlsEnabled', checked)
                            }
                        />
                        {isAiCopilotEnabledOrTrial && (
                            <>
                                <Divider />
                                <SwitchRow
                                    title="AI Agents in Slack"
                                    description="Let people talk to AI Agents from Slack."
                                    checked={
                                        form.values.aiAgentsEnabled ?? true
                                    }
                                    onChange={(checked) =>
                                        setFieldValue(
                                            'aiAgentsEnabled',
                                            checked,
                                        )
                                    }
                                />
                                <Divider />
                                <SwitchRow
                                    title="AI Agents thread access consent"
                                    description="Let agents read earlier messages in a thread when the bot is mentioned there."
                                    disabled={aiAgentsDisabled}
                                    checked={
                                        form.values.aiThreadAccessConsent ??
                                        false
                                    }
                                    onChange={(checked) =>
                                        setFieldValue(
                                            'aiThreadAccessConsent',
                                            checked,
                                        )
                                    }
                                />
                                <Divider />
                                <SwitchRow
                                    title="AI Agents OAuth requirement"
                                    description="People must sign in with OAuth first, so requests run with their own permissions."
                                    disabled={aiAgentsDisabled}
                                    checked={
                                        form.values.aiRequireOAuth ?? false
                                    }
                                    onChange={(checked) =>
                                        setFieldValue('aiRequireOAuth', checked)
                                    }
                                />
                                <Divider />
                                <SwitchRow
                                    title="Links only, no data in Slack"
                                    description="Never post query results into Slack. People open results in the app instead."
                                    disabled={aiAgentsDisabled}
                                    checked={form.values.aiLinksOnly ?? false}
                                    onChange={(checked) =>
                                        setFieldValue('aiLinksOnly', checked)
                                    }
                                />
                                <Divider />
                                <SwitchRow
                                    title="Automatic channel linking"
                                    description="Mentioning the bot in a new channel links an agent to it."
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
                            </>
                        )}
                    </Stack>
                </SettingsCard>

                {isAiCopilotEnabledOrTrial && (
                    <SettingsCard>
                        <Stack gap="md">
                            <SettingRow
                                title="Multi-agent channel"
                                description="A channel where people can talk to any AI agent outside preview projects. Each new thread shows a picker to choose the agent."
                                control={
                                    <Box w={{ base: '100%', sm: 260 }}>
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
                                    </Box>
                                }
                            />

                            {conflictingAgents.length > 0 && (
                                <Callout
                                    variant="warning"
                                    title="Channel already in use by an AI agent"
                                >
                                    <Text fz="xs">
                                        Setting this as the multi-agent channel
                                        will override the channel configuration
                                        on the following{' '}
                                        {conflictingAgents.length > 1
                                            ? 'agents'
                                            : 'agent'}
                                        :
                                    </Text>
                                    <Stack gap="xxs" mt="xs">
                                        {conflictingAgents.map((agent) => (
                                            <Anchor
                                                key={agent.uuid}
                                                component={Link}
                                                to={`/projects/${agent.projectUuid}/ai-agents/${agent.uuid}/edit`}
                                                fz="xs"
                                            >
                                                {agent.name}
                                            </Anchor>
                                        ))}
                                    </Stack>
                                </Callout>
                            )}

                            {form.values.aiMultiAgentChannelId && (
                                <>
                                    <Divider />
                                    <SwitchRow
                                        title="Only respond when mentioned"
                                        description="New messages in this channel are ignored unless they @mention the Slack app."
                                        disabled={aiAgentsDisabled}
                                        checked={
                                            form.values
                                                .aiMultiAgentRequireMention ??
                                            false
                                        }
                                        onChange={(checked) =>
                                            setFieldValue(
                                                'aiMultiAgentRequireMention',
                                                checked,
                                            )
                                        }
                                    />
                                    <Divider />
                                    <SwitchRow
                                        title="Allow all project agents to appear"
                                        description="Turn off to choose which projects' agents appear in the picker."
                                        disabled={aiAgentsDisabled}
                                        checked={
                                            form.values
                                                .aiMultiAgentProjectUuids ===
                                            null
                                        }
                                        onChange={(checked) =>
                                            setFieldValue(
                                                'aiMultiAgentProjectUuids',
                                                checked ? null : [],
                                            )
                                        }
                                    >
                                        {form.values
                                            .aiMultiAgentProjectUuids !==
                                            null && (
                                            <Box mt="sm">
                                                <ProjectSelect
                                                    disabled={aiAgentsDisabled}
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
                                            </Box>
                                        )}
                                    </SwitchRow>
                                </>
                            )}
                        </Stack>
                    </SettingsCard>
                )}

                <Group justify="flex-end">
                    <Button
                        size="xs"
                        type="submit"
                        loading={
                            isUpdatingSlackSettings ||
                            isUpdatingAiOrganizationSettings
                        }
                        leftSection={<MantineIcon icon={IconDeviceFloppy} />}
                    >
                        Save
                    </Button>
                </Group>
            </SlackSection>
        </form>
    );
};

export default SlackSettingsPanel;
