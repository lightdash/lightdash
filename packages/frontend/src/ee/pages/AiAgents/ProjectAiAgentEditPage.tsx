import { type BaseAiAgent } from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Anchor,
    Box,
    Button,
    Card,
    Group,
    LoadingOverlay,
    MultiSelect,
    Stack,
    Tabs,
    TagsInput,
    Text,
    Textarea,
    TextInput,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import {
    IconArrowLeft,
    IconCheck,
    IconInfoCircle,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { LightdashUserAvatar } from '../../../components/Avatar';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import Page from '../../../components/common/Page/Page';
import { useGetSlack, useSlackChannels } from '../../../hooks/slack/useSlack';
import { useProject } from '../../../hooks/useProject';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { ConversationsList } from '../../features/aiCopilot/components/ConversationsList';
import { SlackIntegrationSteps } from '../../features/aiCopilot/components/SlackIntegrationSteps';
import { useAiAgentPermission } from '../../features/aiCopilot/hooks/useAiAgentPermission';
import { useDeleteAiAgentMutation } from '../../features/aiCopilot/hooks/useOrganizationAiAgents';
import {
    useProjectAiAgent,
    useProjectAiAgents,
    useProjectCreateAiAgentMutation,
    useProjectUpdateAiAgentMutation,
} from '../../features/aiCopilot/hooks/useProjectAiAgents';

const formSchema: z.ZodType<
    Pick<
        BaseAiAgent,
        'name' | 'integrations' | 'tags' | 'instruction' | 'imageUrl'
    >
> = z.object({
    name: z.string().min(1),
    integrations: z.array(
        z.object({
            type: z.literal('slack'),
            channelId: z.string().min(1),
        }),
    ),
    tags: z.array(z.string()).nullable(),
    instruction: z.string().nullable(),
    imageUrl: z.string().url().nullable(),
});

type Props = {
    isCreateMode?: boolean;
};

const ProjectAiAgentEditPage: FC<Props> = ({ isCreateMode = false }) => {
    const { agentUuid, projectUuid } = useParams<{
        agentUuid: string;
        projectUuid: string;
    }>();
    const canManageAgents = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });

    const navigate = useNavigate();
    const { track } = useTracking();
    const { user } = useApp();

    const [deleteModalOpen, setDeleteModalOpen] = useState(false);

    const { data: project } = useProject(projectUuid);
    const { mutateAsync: createAgent, isLoading: isCreating } =
        useProjectCreateAiAgentMutation(projectUuid!);
    const { mutateAsync: updateAgent, isLoading: isUpdating } =
        useProjectUpdateAiAgentMutation(projectUuid!);
    const { mutateAsync: deleteAgent } = useDeleteAiAgentMutation();

    const actualAgentUuid = !isCreateMode && agentUuid ? agentUuid : undefined;

    const { data: agent, isLoading: isLoadingAgent } = useProjectAiAgent(
        projectUuid,
        actualAgentUuid,
    );

    const { data: slackInstallation, isLoading: isLoadingSlackInstallation } =
        useGetSlack();

    const { data: agents, isSuccess: isSuccessAgents } =
        useProjectAiAgents(projectUuid);

    const {
        data: slackChannels,
        refresh: refreshChannels,
        isRefreshing,
    } = useSlackChannels(
        '',
        {
            excludeArchived: true,
            excludeDms: true,
            excludeGroups: true,
        },
        {
            enabled: !!slackInstallation?.organizationUuid && isSuccessAgents,
        },
    );

    const slackChannelOptions = useMemo(
        () =>
            slackChannels?.map((channel) => ({
                value: channel.id,
                label: channel.name,
                disabled: agents?.some((a) =>
                    a.integrations.some((i) => i.channelId === channel.id),
                ),
            })) ?? [],
        [slackChannels, agents],
    );

    const form = useForm<z.infer<typeof formSchema>>({
        initialValues: {
            name: '',
            integrations: [],
            tags: null,
            instruction: null,
            imageUrl: null,
        },
        validate: zodResolver(formSchema),
    });

    useEffect(() => {
        if (isCreateMode || !agent) {
            return;
        }

        if (!form.initialized) {
            const values = {
                name: agent.name,
                integrations: agent.integrations,
                tags: agent.tags && agent.tags.length > 0 ? agent.tags : null,
                instruction: agent.instruction,
                imageUrl: agent.imageUrl,
            };
            form.setValues(values);
            form.resetDirty(values);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agent, isCreateMode]);

    const handleBack = () => {
        void navigate(-1);
    };

    const handleSubmit = form.onSubmit(async (values) => {
        if (!projectUuid || !user?.data) {
            return;
        }

        if (isCreateMode) {
            const result = await createAgent({
                ...values,
                projectUuid,
            });

            if (user.data.organizationUuid) {
                track({
                    name: EventName.AI_AGENT_CREATED,
                    properties: {
                        userId: user.data.userUuid,
                        organizationId: user.data.organizationUuid,
                        projectId: projectUuid,
                        aiAgentId: result.uuid,
                        agentName: values.name,
                    },
                });
            }
        } else if (actualAgentUuid) {
            await updateAgent({
                uuid: actualAgentUuid,
                projectUuid,
                ...values,
            });

            if (user.data.organizationUuid) {
                track({
                    name: EventName.AI_AGENT_UPDATED,
                    properties: {
                        userId: user.data.userUuid,
                        organizationId: user.data.organizationUuid,
                        projectId: projectUuid,
                        aiAgentId: actualAgentUuid,
                        agentName: values.name,
                    },
                });
            }
        }
    });

    const handleDeleteClick = useCallback(() => {
        setDeleteModalOpen(true);
    }, []);

    const handleDelete = useCallback(async () => {
        if (!actualAgentUuid || !user?.data || !projectUuid || !agent) {
            return;
        }

        await deleteAgent(actualAgentUuid);

        if (user.data.organizationUuid) {
            track({
                name: EventName.AI_AGENT_DELETED,
                properties: {
                    userId: user.data.userUuid,
                    organizationId: user.data.organizationUuid,
                    projectId: projectUuid,
                    aiAgentId: actualAgentUuid,
                    agentName: agent.name,
                },
            });
        }

        setDeleteModalOpen(false);
    }, [actualAgentUuid, deleteAgent, user?.data, projectUuid, agent, track]);

    const handleCancelDelete = useCallback(() => {
        setDeleteModalOpen(false);
    }, []);

    useEffect(() => {
        if (!canManageAgents) {
            void navigate(`/projects/${projectUuid}/ai-agents`);
        }
    }, [canManageAgents, navigate, projectUuid]);

    if (!isCreateMode && actualAgentUuid && !agent && !isLoadingAgent) {
        return (
            <Page withFullHeight>
                <Stack gap="md">
                    <Group gap="xs">
                        <Button
                            variant="subtle"
                            leftSection={<MantineIcon icon={IconArrowLeft} />}
                            onClick={handleBack}
                        >
                            Back to Agents
                        </Button>
                    </Group>
                    <Card withBorder p="xl">
                        <Text>Agent not found</Text>
                    </Card>
                </Stack>
            </Page>
        );
    }

    return (
        <Page withFullHeight withCenteredRoot withXLargePaddedContent>
            <Stack gap="sm">
                <Group gap="sm" align="center">
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        onClick={handleBack}
                    >
                        <MantineIcon icon={IconArrowLeft} />
                    </ActionIcon>

                    <Group gap="xs">
                        <LightdashUserAvatar
                            name={isCreateMode ? '+' : form.values.name}
                            variant="filled"
                            size="sm"
                            src={
                                !isCreateMode ? form.values.imageUrl : undefined
                            }
                        />

                        <Group gap="xs">
                            <Title order={5}>
                                {isCreateMode
                                    ? 'New Agent'
                                    : agent?.name || 'Agent'}
                            </Title>
                            <Tooltip
                                fz="xs"
                                position="right"
                                label={
                                    <Text fz="xs" fw={500}>
                                        Last modified:
                                        <Text fz="xs" span>
                                            {new Date(
                                                agent?.updatedAt ?? new Date(),
                                            ).toLocaleString()}
                                        </Text>
                                    </Text>
                                }
                                withArrow
                            >
                                <MantineIcon icon={IconInfoCircle} />
                            </Tooltip>
                        </Group>
                    </Group>
                </Group>

                <Tabs defaultValue="setup">
                    <Tabs.List>
                        <Tabs.Tab value="setup">Setup</Tabs.Tab>
                        {!isCreateMode && (
                            <Tabs.Tab value="conversations">
                                Conversations
                            </Tabs.Tab>
                        )}
                    </Tabs.List>

                    <Tabs.Panel value="setup" pt="lg">
                        <form onSubmit={handleSubmit}>
                            <Group gap="xxl" align="flex-start">
                                <Stack gap="xs" align="center" maw={300}>
                                    <LightdashUserAvatar
                                        name={
                                            isCreateMode
                                                ? '+'
                                                : form.values.name
                                        }
                                        variant="filled"
                                        size={120}
                                        src={
                                            !isCreateMode
                                                ? form.values.imageUrl
                                                : undefined
                                        }
                                    />
                                    <TextInput
                                        style={{ flexGrow: 1 }}
                                        miw={200}
                                        labelProps={{
                                            style: {
                                                width: '100%',
                                            },
                                        }}
                                        label={
                                            <Group gap="xs">
                                                <Text>Avatar image URL</Text>
                                                <Tooltip
                                                    label="Please provide an image url like https://example.com/avatar.jpg. If not provided, a default avatar will be used."
                                                    withArrow
                                                    withinPortal
                                                    multiline
                                                    maw="250px"
                                                >
                                                    <MantineIcon
                                                        icon={IconInfoCircle}
                                                    />
                                                </Tooltip>
                                            </Group>
                                        }
                                        placeholder="https://example.com/avatar.jpg"
                                        type="url"
                                        {...form.getInputProps('imageUrl')}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            form.setFieldValue(
                                                'imageUrl',
                                                value ? value : null,
                                            );
                                        }}
                                    />
                                </Stack>

                                <Stack gap="lg">
                                    {/* Basic Agent Info */}
                                    <Stack gap="sm">
                                        <TextInput
                                            label="Agent Name"
                                            placeholder="Enter a name for this agent"
                                            {...form.getInputProps('name')}
                                            style={{ flexGrow: 1 }}
                                        />

                                        <TextInput
                                            label="Project"
                                            placeholder="Enter a project"
                                            value={project?.name}
                                            readOnly
                                        />

                                        <TagsInput
                                            label="Tags"
                                            placeholder="Select tags"
                                            {...form.getInputProps('tags')}
                                            value={
                                                form.getInputProps('tags')
                                                    .value ?? []
                                            }
                                            onChange={(value) => {
                                                form.setFieldValue(
                                                    'tags',
                                                    value.length > 0
                                                        ? value
                                                        : null,
                                                );
                                            }}
                                        />
                                    </Stack>

                                    <Stack gap="sm">
                                        <Textarea
                                            label="Instructions"
                                            description="Instructions set the overall behavior and task for the agent. This defines how it should respond and what its purpose is."
                                            placeholder="You are a helpful assistant that specializes in sales data analytics."
                                            resize="vertical"
                                            {...form.getInputProps(
                                                'instruction',
                                            )}
                                        />
                                    </Stack>

                                    {/* Integrations Section */}
                                    <Stack gap="sm">
                                        <Stack gap="md">
                                            <Title order={6}>Slack</Title>

                                            <LoadingOverlay
                                                visible={
                                                    isLoadingSlackInstallation
                                                }
                                            />

                                            {!slackInstallation?.organizationUuid ? (
                                                <Alert
                                                    color="yellow"
                                                    icon={
                                                        <MantineIcon
                                                            icon={
                                                                IconInfoCircle
                                                            }
                                                        />
                                                    }
                                                >
                                                    <Text fw={500} mb="xs">
                                                        Slack integration
                                                        required
                                                    </Text>
                                                    <Text size="sm">
                                                        To enable AI agent
                                                        interactions through
                                                        Slack, please connect
                                                        your Slack workspace in
                                                        the{' '}
                                                        <Anchor
                                                            href="/generalSettings/integrations"
                                                            target="_blank"
                                                            fz="sm"
                                                        >
                                                            Integrations
                                                            settings
                                                        </Anchor>
                                                        . Once connected, you
                                                        can select channels
                                                        where this agent will be
                                                        available.
                                                    </Text>
                                                </Alert>
                                            ) : (
                                                <Box>
                                                    <SlackIntegrationSteps
                                                        slackInstallation={
                                                            !!slackInstallation?.organizationUuid
                                                        }
                                                        channelsConfigured={form.values.integrations.some(
                                                            (i) =>
                                                                i.type ===
                                                                    'slack' &&
                                                                i.channelId,
                                                        )}
                                                    />

                                                    <Stack gap="xs">
                                                        <MultiSelect
                                                            disabled={
                                                                isRefreshing ||
                                                                !slackInstallation?.organizationUuid
                                                            }
                                                            description={
                                                                !slackInstallation?.organizationUuid
                                                                    ? 'You need to connect Slack first in the Integrations settings before you can configure AI agents.'
                                                                    : undefined
                                                            }
                                                            labelProps={{
                                                                style: {
                                                                    width: '100%',
                                                                },
                                                            }}
                                                            label="Channels"
                                                            placeholder="Pick a channel"
                                                            data={
                                                                slackChannelOptions
                                                            }
                                                            value={form.values.integrations.map(
                                                                (i) =>
                                                                    i.channelId,
                                                            )}
                                                            searchable
                                                            rightSectionPointerEvents="all"
                                                            rightSection={
                                                                <Tooltip
                                                                    withArrow
                                                                    withinPortal
                                                                    label="Refresh Slack Channels"
                                                                >
                                                                    <ActionIcon
                                                                        variant="transparent"
                                                                        onClick={
                                                                            refreshChannels
                                                                        }
                                                                    >
                                                                        <MantineIcon
                                                                            icon={
                                                                                IconRefresh
                                                                            }
                                                                        />
                                                                    </ActionIcon>
                                                                </Tooltip>
                                                            }
                                                            onChange={(
                                                                value,
                                                            ) => {
                                                                form.setFieldValue(
                                                                    'integrations',
                                                                    value.map(
                                                                        (v) =>
                                                                            ({
                                                                                type: 'slack',
                                                                                channelId:
                                                                                    v,
                                                                            } as const),
                                                                    ),
                                                                );
                                                            }}
                                                        />
                                                    </Stack>
                                                </Box>
                                            )}
                                        </Stack>
                                    </Stack>

                                    <Group justify="flex-end">
                                        {!isCreateMode && (
                                            <Button
                                                variant="outline"
                                                color="red"
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconTrash}
                                                    />
                                                }
                                                onClick={handleDeleteClick}
                                            >
                                                Delete agent
                                            </Button>
                                        )}
                                        <Button
                                            type="submit"
                                            loading={isCreating || isUpdating}
                                            leftSection={
                                                <MantineIcon icon={IconCheck} />
                                            }
                                            disabled={
                                                isCreateMode
                                                    ? !form.isValid()
                                                    : !form.isDirty()
                                            }
                                        >
                                            {isCreateMode
                                                ? 'Create agent'
                                                : 'Save changes'}
                                        </Button>
                                    </Group>
                                </Stack>
                            </Group>
                        </form>
                    </Tabs.Panel>
                    <Tabs.Panel value="conversations" pt="lg">
                        <ConversationsList
                            agentUuid={actualAgentUuid!}
                            agentName={agent?.name ?? 'Agent'}
                            allUsers={canManageAgents}
                        />
                    </Tabs.Panel>
                </Tabs>

                <MantineModal
                    opened={deleteModalOpen}
                    onClose={handleCancelDelete}
                    title="Delete Agent"
                    icon={IconTrash}
                    actions={
                        <Group>
                            <Button
                                variant="subtle"
                                onClick={handleCancelDelete}
                            >
                                Cancel
                            </Button>
                            <Button color="red" onClick={handleDelete}>
                                Delete
                            </Button>
                        </Group>
                    }
                >
                    <Stack gap="md">
                        <Text>
                            Are you sure you want to delete this agent? This
                            action cannot be undone.
                        </Text>
                    </Stack>
                </MantineModal>
            </Stack>
        </Page>
    );
};

export default ProjectAiAgentEditPage;
