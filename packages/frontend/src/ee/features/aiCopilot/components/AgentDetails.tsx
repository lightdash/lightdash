import { AiAgentIntegrationType, type AiAgent } from '@lightdash/common';
import {
    Avatar,
    Button,
    Card,
    Group,
    Loader,
    MantineProvider,
    Select,
    Stack,
    Tabs,
    TagsInput,
    Text,
    Textarea,
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
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
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
    Pick<
        AiAgent,
        'name' | 'projectUuid' | 'integrations' | 'tags' | 'instructions'
    >
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
    instructions: z.string().nullable(),
});

type AgentState =
    | {
          mode: 'create';
          data: null;
          uuid: null;
      }
    | {
          mode: 'loading';
          data: null;
          uuid: string;
      }
    | {
          mode: 'edit';
          data: AiAgent;
          uuid: string;
      };

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

    const [agentState, setAgentState] = useState<AgentState>(() => {
        if (agentId === 'new') {
            return {
                mode: 'create',
                data: null,
                uuid: null,
            };
        }
        return {
            mode: 'loading',
            data: null,
            uuid: agentId || '',
        };
    });

    const { data: agent } = useAiAgent(agentState.uuid || '', {
        enabled: agentState.mode !== 'create' && !!agentState.uuid,
    });

    useEffect(() => {
        if (agentState.mode === 'loading' && agent) {
            setAgentState({
                mode: 'edit',
                data: agent.results,
                uuid: agentState.uuid,
            });
        }
    }, [agent, agentState.mode, agentState.uuid]);

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
            instructions: '',
        },
        validate: zodResolver(formSchema),
    });

    useEffect(() => {
        if (agentState.mode === 'create' || !agent) {
            return;
        }

        if (!form.initialized) {
            form.setValues({
                name: agent.results.name,
                projectUuid: agent.results.projectUuid,
                integrations: agent.results.integrations,
                tags: agent.results.tags,
                instructions: agent.results.instructions,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agent, agentState.mode]);

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
        if (agentState.mode === 'create') {
            await createAgent(values);
        } else if (agentState.uuid) {
            await updateAgent({
                uuid: agentState.uuid,
                ...values,
            });
        }
    });

    const handleDelete = useCallback(async () => {
        // You would need to implement a delete mutation
        void navigate('/generalSettings/aiAgents');
    }, [navigate]);

    if (agentState.mode === 'edit' && agentState.uuid && !agent) {
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

    if (agentState.mode === 'loading') {
        return (
            <MantineProvider>
                <Stack align="center" justify="center">
                    <Loader size="lg" color="gray" />
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
                                {agentState.mode === 'create'
                                    ? '+'
                                    : agentState.uuid}
                            </Avatar>
                            <Title order={3}>
                                {agentState.mode === 'create'
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
                                {agentState.mode === 'edit' && (
                                    <Tabs.Tab value="conversations">
                                        Conversations
                                    </Tabs.Tab>
                                )}
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

                                        <Stack gap="sm">
                                            <Title order={5}>
                                                Configuration
                                            </Title>

                                            <Textarea
                                                label="System Prompt"
                                                description="The system prompt sets the
                                                    overall behavior and task
                                                    for the agent. This defines
                                                    how it should respond and
                                                    what its purpose is."
                                                placeholder="You are a helpful assistant that specializes in sales data analytics."
                                                resize="vertical"
                                                {...form.getInputProps(
                                                    'instructions',
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

                                    <Group justify="flex-end" mt="sm">
                                        {agentState.mode === 'edit' && (
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
                                            {agentState.mode === 'create'
                                                ? 'Create agent'
                                                : 'Save changes'}
                                        </Button>
                                    </Group>
                                </form>
                            </Tabs.Panel>
                            {agentState.mode === 'edit' && (
                                <Tabs.Panel value="conversations" pt="xs">
                                    <ConversationsList
                                        agentUuid={agentState.uuid ?? ''}
                                    />
                                </Tabs.Panel>
                            )}
                        </Tabs>
                    </Stack>
                </Card>
            </Stack>
        </MantineProvider>
    );
};
