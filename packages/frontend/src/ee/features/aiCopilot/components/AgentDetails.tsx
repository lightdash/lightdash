import { type SlackAppCustomSettings } from '@lightdash/common';
import {
    ActionIcon,
    Avatar,
    Button,
    Card,
    Divider,
    Group,
    MantineProvider,
    Paper,
    Radio,
    Select,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import {
    IconArrowLeft,
    IconArrowsHorizontal,
    IconCheck,
    IconDatabase,
    IconHash,
    IconRefresh,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, type FC } from 'react';
import { useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import MantineIcon from '../../../../components/common/MantineIcon';
import { TagInput } from '../../../../components/common/TagInput/TagInput';
import {
    useGetSlack,
    useSlackChannels,
    useUpdateSlackAppCustomSettingsMutation,
} from '../../../../hooks/slack/useSlack';
import { useProjects } from '../../../../hooks/useProjects';

const formSchema = z.object({
    slackChannelProjectMapping: z.object({
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
});

export const AgentDetails: FC = () => {
    const { agentId } = useParams<{ agentId: string }>();
    const navigate = useNavigate();
    const isCreateMode = agentId === 'new';
    const index = !isCreateMode && agentId ? parseInt(agentId, 10) - 1 : -1;

    const { data: slackInstallation } = useGetSlack();
    const {
        data: slackChannels,
        refresh: refreshChannels,
        isLoading: isRefreshing,
    } = useSlackChannels('', true, {
        enabled: !!slackInstallation?.organizationUuid,
    });
    const { data: projects } = useProjects();

    const { mutateAsync: updateCustomSettings, isLoading: isSubmitting } =
        useUpdateSlackAppCustomSettingsMutation();

    const form = useForm<{
        slackChannelProjectMapping:
            | NonNullable<
                  SlackAppCustomSettings['slackChannelProjectMappings']
              >[number]
            | undefined;
    }>({
        initialValues: {
            slackChannelProjectMapping: isCreateMode
                ? {
                      projectUuid: '',
                      slackChannelId: '',
                      availableTags: null,
                  }
                : undefined,
        },
        validate: zodResolver(formSchema),
    });

    useEffect(() => {
        if (isCreateMode) {
            return;
        }

        if (!slackInstallation?.slackChannelProjectMappings) {
            return;
        }

        if (!form.initialized) {
            form.setValues({
                slackChannelProjectMapping:
                    slackInstallation.slackChannelProjectMappings[index],
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slackInstallation?.slackChannelProjectMappings, index, isCreateMode]);

    const agent = useMemo(() => {
        if (isCreateMode) {
            return {
                name: 'New Agent',
                projectName: undefined,
                channelName: undefined,
                projectUuid: '',
                slackChannelId: '',
                availableTags: [],
            };
        }

        if (!slackInstallation?.slackChannelProjectMappings || index < 0) {
            return null;
        }

        const mappings = slackInstallation.slackChannelProjectMappings;
        if (index >= mappings.length) {
            return null;
        }

        const mapping = mappings[index];
        const project = projects?.find(
            (p) => p.projectUuid === mapping.projectUuid,
        );
        const channel = slackChannels?.find(
            (c) => c.id === mapping.slackChannelId,
        );
        return {
            name: `Agent ${index + 1}`,
            projectName: project?.name,
            channelName: channel?.name,
            projectUuid: mapping.projectUuid,
            slackChannelId: mapping.slackChannelId,
            availableTags: mapping.availableTags || [],
        };
    }, [slackInstallation, projects, slackChannels, index, isCreateMode]);

    const slackChannelOptions = useMemo(() => {
        return (
            slackChannels?.map((channel) => ({
                value: channel.id,
                label: channel.name,
            })) ?? []
        );
    }, [slackChannels]);

    const projectOptions = useMemo(() => {
        return (
            projects?.map((project) => ({
                value: project.projectUuid,
                label: project.name,
            })) ?? []
        );
    }, [projects]);

    const usedChannels = useMemo(() => {
        return (
            slackInstallation?.slackChannelProjectMappings
                ?.filter((_, i) => i !== index)
                .map((mapping) => mapping.slackChannelId) ?? []
        );
    }, [slackInstallation?.slackChannelProjectMappings, index]);

    const handleBack = () => {
        void navigate('/generalSettings/aiAgents');
    };

    const handleSubmit = form.onSubmit(async (values) => {
        if (
            !slackInstallation?.organizationUuid ||
            !values.slackChannelProjectMapping
        ) {
            return;
        }

        const currentMappings =
            slackInstallation.slackChannelProjectMappings || [];

        let newMappings;
        if (isCreateMode) {
            // Add new mapping
            newMappings = [
                ...currentMappings,
                values.slackChannelProjectMapping,
            ];
        } else {
            // Update existing mapping
            newMappings = currentMappings.map((mapping, i) => {
                if (i === index) {
                    return values.slackChannelProjectMapping!;
                }
                return mapping;
            });
        }

        await updateCustomSettings({
            notificationChannel: slackInstallation.notificationChannel ?? null,
            appProfilePhotoUrl: slackInstallation.appProfilePhotoUrl ?? null,
            slackChannelProjectMappings: newMappings,
        });

        void navigate('/generalSettings/aiAgents');
    });

    const showTagsInput =
        form.values.slackChannelProjectMapping?.availableTags !== null;

    const handleDelete = useCallback(async () => {
        if (slackInstallation?.organizationUuid) {
            await updateCustomSettings({
                notificationChannel:
                    slackInstallation.notificationChannel ?? null,
                appProfilePhotoUrl:
                    slackInstallation.appProfilePhotoUrl ?? null,
                slackChannelProjectMappings:
                    slackInstallation.slackChannelProjectMappings?.filter(
                        (_, i) => i !== index,
                    ) ?? [],
            });
            void navigate('/generalSettings/aiAgents');
        }
    }, [slackInstallation, index, updateCustomSettings, navigate]);

    if (!agent && !isCreateMode) {
        return (
            <MantineProvider>
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
            </MantineProvider>
        );
    }

    return (
        <MantineProvider>
            <Stack gap="sm">
                <Group gap="xs">
                    <Button
                        variant="subtle"
                        leftSection={<MantineIcon icon={IconArrowLeft} />}
                        onClick={handleBack}
                    >
                        Back to Agents
                    </Button>
                </Group>

                <form onSubmit={handleSubmit}>
                    <Card withBorder p="xl">
                        <Stack gap="xl">
                            <Group gap="md">
                                <Avatar size={40} radius="sm" color="blue.6">
                                    {isCreateMode ? '+' : index + 1}
                                </Avatar>
                                <Title order={3}>
                                    {agent?.name || 'New Agent'}
                                </Title>
                            </Group>

                            {!isCreateMode &&
                                agent?.projectName &&
                                agent?.channelName && (
                                    <Stack gap="xs">
                                        <Title order={5}>Description</Title>
                                        <Text>
                                            This AI agent answers questions
                                            about <b>{agent.projectName}</b>{' '}
                                            data when asked in the Slack channel{' '}
                                            <b>{agent.channelName}</b>.
                                        </Text>
                                    </Stack>
                                )}

                            <Stack gap="xs">
                                <Group justify="space-between">
                                    <Group gap="xs">
                                        <Title order={5}>
                                            Slack Channel Project Mappings
                                        </Title>

                                        <Tooltip
                                            variant="xs"
                                            multiline
                                            maw={250}
                                            label={
                                                <Text fw={500}>
                                                    Refresh Slack channel list.
                                                    <Text c="gray.4" fw={400}>
                                                        To see private channels,
                                                        ensure the bot has been
                                                        invited to them.
                                                        Archived channels are
                                                        not included.
                                                    </Text>
                                                </Text>
                                            }
                                        >
                                            <ActionIcon
                                                loading={isRefreshing}
                                                onClick={refreshChannels}
                                                variant="subtle"
                                            >
                                                <MantineIcon
                                                    icon={IconRefresh}
                                                />
                                            </ActionIcon>
                                        </Tooltip>
                                    </Group>
                                </Group>
                                <Text size="xs" c="dimmed">
                                    Map which project is associated with which
                                    Slack channel. When a user asks a question
                                    in a channel, Lightdash will look for the
                                    answer in the associated project.
                                </Text>

                                <Paper py="xs" shadow="xs" withBorder>
                                    <Stack gap="xs">
                                        <Group gap="xs" px="xs" wrap="nowrap">
                                            <Select
                                                size="xs"
                                                data={projectOptions}
                                                searchable
                                                placeholder="Select project"
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconDatabase}
                                                    />
                                                }
                                                {...form.getInputProps(
                                                    `slackChannelProjectMapping.projectUuid`,
                                                )}
                                            />

                                            <MantineIcon
                                                icon={IconArrowsHorizontal}
                                                color="gray.5"
                                            />

                                            <Select
                                                size="xs"
                                                data={slackChannelOptions.map(
                                                    (channel) => ({
                                                        value: channel.value,
                                                        label: channel.label.replace(
                                                            /^#/,
                                                            '',
                                                        ),
                                                        disabled:
                                                            usedChannels.includes(
                                                                channel.value,
                                                            ),
                                                    }),
                                                )}
                                                searchable
                                                placeholder="Select channel"
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconHash}
                                                    />
                                                }
                                                {...form.getInputProps(
                                                    `slackChannelProjectMapping.slackChannelId`,
                                                )}
                                            />
                                        </Group>

                                        <Divider />

                                        <Stack gap="xs" px="xs">
                                            <Radio.Group
                                                size="xs"
                                                label="Configure available tags"
                                                value={
                                                    showTagsInput
                                                        ? 'tags'
                                                        : 'all'
                                                }
                                                onChange={(value) => {
                                                    form.setFieldValue(
                                                        `slackChannelProjectMapping.availableTags`,
                                                        value === 'all'
                                                            ? null
                                                            : [],
                                                    );
                                                }}
                                            >
                                                <Stack gap="xs" pt="xs">
                                                    <Radio
                                                        value="all"
                                                        label="All dimensions, and metrics"
                                                    />
                                                    <Radio
                                                        value="tags"
                                                        label="Only dimensions and metrics with any of the following tags"
                                                    />

                                                    {showTagsInput && (
                                                        <TagInput
                                                            size="xs"
                                                            placeholder='Type in tags and press "Enter"'
                                                            {...form.getInputProps(
                                                                `slackChannelProjectMapping.availableTags`,
                                                            )}
                                                        />
                                                    )}
                                                </Stack>
                                            </Radio.Group>
                                        </Stack>
                                    </Stack>
                                </Paper>
                            </Stack>

                            <Group justify="flex-end">
                                {!isCreateMode && (
                                    <Button
                                        variant="outline"
                                        onClick={handleDelete}
                                    >
                                        Delete agent
                                    </Button>
                                )}
                                <Button
                                    type="submit"
                                    loading={isSubmitting}
                                    leftSection={
                                        <MantineIcon icon={IconCheck} />
                                    }
                                >
                                    {isCreateMode
                                        ? 'Create agent'
                                        : 'Save changes'}
                                </Button>
                            </Group>
                        </Stack>
                    </Card>
                </form>
            </Stack>
        </MantineProvider>
    );
};
