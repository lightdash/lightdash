import {
    AiAgentIntegrationType,
    type ApiCreateAiAgent,
    type BaseAiAgent,
} from '@lightdash/common';
import {
    Avatar,
    Button,
    Card,
    Group,
    MantineProvider,
    Select,
    Stack,
    Tabs,
    TagsInput,
    Text,
    TextInput,
    Title,
} from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import {
    IconArrowLeft,
    IconCheck,
    IconDatabase,
    IconRefresh,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, type FC } from 'react';
import { useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import MantineIcon from '../../../../components/common/MantineIcon';
import {
    useGetSlack,
    useSlackChannels,
} from '../../../../hooks/slack/useSlack';
import { useProjects } from '../../../../hooks/useProjects';
import {
    useAiAgent,
    useCreateAiAgentMutation,
    useUpdateAiAgentMutation,
} from '../hooks/useAiAgents';
import { ConversationsList } from './ConversationsList';

const formSchema: z.ZodType<
    Pick<BaseAiAgent, 'name' | 'projectUuid' | 'integrations' | 'tags'>
> = z.object({
    name: z.string().min(1),
    projectUuid: z
        .string({ message: 'You must select a project' })
        .uuid({ message: 'Invalid project' }),
    integrations: z.array(
        z.object({
            type: z.nativeEnum(AiAgentIntegrationType),
            channelId: z.string().min(1),
        }),
    ),
    tags: z.array(z.string()).nullable(),
});

export const AgentDetails: FC = () => {
    const navigate = useNavigate();
    const { agentId } = useParams<{ agentId: string }>();
    const { mutateAsync: createAgent } = useCreateAiAgentMutation({
        onSuccess: () => {
            void navigate('/generalSettings/aiAgents');
        },
    });
    const { mutateAsync: updateAgent } = useUpdateAiAgentMutation({
        onSuccess: () => {
            void navigate('/generalSettings/aiAgents');
        },
    });
    const isCreateMode = agentId === 'new';
    const agentUuid = !isCreateMode && agentId ? agentId : undefined;

    const { data: agent } = useAiAgent(agentUuid || '', {
        enabled: !!agentUuid,
    });

    const { data: slackInstallation } = useGetSlack();
    const {
        data: slackChannels,
        refresh: _refreshChannels,
        isLoading: _isRefreshing,
    } = useSlackChannels('', true, {
        enabled: !!slackInstallation?.organizationUuid,
    });
    const { data: projects } = useProjects();

    const form = useForm<z.infer<typeof formSchema>>({
        initialValues: {
            name: '',
            projectUuid: '',
            integrations: [],
            tags: [],
        },
        validate: zodResolver(formSchema),
    });

    useEffect(() => {
        if (isCreateMode || !agent) {
            return;
        }

        if (!form.initialized) {
            form.setValues({
                name: agent.results.name,
                projectUuid: agent.results.projectUuid,
                integrations: agent.results.integrations,
                tags: agent.results.tags,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agent, isCreateMode]);

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

    const handleBack = () => {
        void navigate('/generalSettings/aiAgents');
    };

    const handleSubmit = form.onSubmit(async (values) => {
        if (isCreateMode) {
            await createAgent(values as ApiCreateAiAgent);
        } else if (agentUuid) {
            await updateAgent({
                uuid: agentUuid,
                ...values,
            });
        }
    });

    const handleDelete = useCallback(async () => {
        // You would need to implement a delete mutation
        void navigate('/generalSettings/aiAgents');
    }, [navigate]);

    if (!isCreateMode && agentUuid && !agent) {
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

                <Card withBorder p="xl">
                    <Stack gap="xl">
                        <Group gap="md">
                            <Avatar size={40} radius="sm" color="blue.6">
                                {isCreateMode ? '+' : agentId}
                            </Avatar>
                            <Title order={3}>
                                {isCreateMode
                                    ? 'New Agent'
                                    : form.values.name || 'Agent'}
                            </Title>
                        </Group>
                        <Tabs
                            defaultValue="general"
                            styles={{
                                panel: {
                                    paddingTop: 'xs',
                                },
                            }}
                        >
                            <Tabs.List>
                                <Tabs.Tab value="general">General</Tabs.Tab>
                                <Tabs.Tab value="conversations">
                                    Conversations
                                </Tabs.Tab>
                            </Tabs.List>

                            <Tabs.Panel value="general" pt="xs">
                                <form onSubmit={handleSubmit}>
                                    <Stack gap="lg">
                                        {/* Basic Agent Info */}
                                        <Stack gap="sm">
                                            <Title order={5}>Details</Title>
                                            <TextInput
                                                label="Agent Name"
                                                placeholder="Enter a name for this agent"
                                                {...form.getInputProps('name')}
                                            />

                                            <Select
                                                label="Project"
                                                placeholder="Select a project"
                                                data={projectOptions}
                                                searchable
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconDatabase}
                                                    />
                                                }
                                                {...form.getInputProps(
                                                    'projectUuid',
                                                )}
                                            />
                                        </Stack>

                                        {/* Integrations Section */}
                                        <Stack gap="sm">
                                            <Group justify="space-between">
                                                <Title order={5}>
                                                    Integrations
                                                </Title>
                                                <Button
                                                    size="xs"
                                                    variant="subtle"
                                                    leftSection={
                                                        <MantineIcon
                                                            icon={IconRefresh}
                                                        />
                                                    }
                                                    loading={_isRefreshing}
                                                    onClick={_refreshChannels}
                                                >
                                                    Refresh Channels
                                                </Button>
                                            </Group>

                                            <TagsInput
                                                label="Slack"
                                                placeholder="Pick a channel"
                                                data={slackChannelOptions}
                                                value={form.values.integrations.map(
                                                    (i) => i.channelId,
                                                )}
                                                onChange={(value) => {
                                                    form.setFieldValue(
                                                        'integrations',
                                                        value.map((v) => ({
                                                            type: AiAgentIntegrationType.SLACK,
                                                            channelId: v,
                                                        })),
                                                    );
                                                }}
                                            />
                                        </Stack>
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
                                            loading={false}
                                            leftSection={
                                                <MantineIcon icon={IconCheck} />
                                            }
                                        >
                                            {isCreateMode
                                                ? 'Create agent'
                                                : 'Save changes'}
                                        </Button>
                                    </Group>
                                </form>
                            </Tabs.Panel>
                            <Tabs.Panel value="conversations" pt="xs">
                                <ConversationsList
                                    agentUuid={agentUuid ?? ''}
                                />
                            </Tabs.Panel>
                        </Tabs>
                    </Stack>
                </Card>
            </Stack>
        </MantineProvider>
    );
};
