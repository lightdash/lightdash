import { FeatureFlags } from '@lightdash/common';
import {
    Anchor,
    Badge,
    Box,
    Button,
    Card,
    Code,
    Collapse,
    Group,
    HoverCard,
    LoadingOverlay,
    MultiSelect,
    Paper,
    SegmentedControl,
    Stack,
    Switch,
    TagsInput,
    Text,
    Textarea,
    TextInput,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import {
    IconAdjustmentsAlt,
    IconAlertTriangle,
    IconBook2,
    IconBrandSpeedtest,
    IconInfoCircle,
    IconLock,
    IconPlug,
    IconPointFilled,
    IconSparkles,
    IconTrash,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState } from 'react';
import { z } from 'zod';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import { SlackChannelSelect } from '../../../../components/common/SlackChannelSelect';
import { useGetSlack } from '../../../../hooks/slack/useSlack';
import { useOrganizationGroups } from '../../../../hooks/useOrganizationGroups';
import { useProject } from '../../../../hooks/useProject';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../providers/App/useApp';
import { UserAccessMultiSelect } from '../../../components/UserAccessMultiSelect';
import AiExploreAccessTree from '../../../pages/AiAgents/AiExploreAccessTree';
import {
    useDeleteAiAgentMutation,
    useProjectAiMcpServers,
    useProjectCreateAiMcpServerMutation,
} from '../hooks/useProjectAiAgents';
import { useGetAgentExploreAccessSummary } from '../hooks/useUserAgentPreferences';
import {
    InstructionsGuidelines,
    InstructionsTemplates,
} from './InstructionsSupport';
import { SpaceAccessSelect } from './SpaceAccessSelect';

const CREATE_MCP_SERVER_OPTION_VALUE = '__create_new_mcp_server__';

const formSchema = z.object({
    name: z.string().min(1),
    description: z.string().nullable(),
    integrations: z.array(
        z.object({
            type: z.literal('slack'),
            channelId: z.string().min(1),
        }),
    ),
    tags: z.array(z.string()).nullable(),
    instruction: z.string().nullable(),
    imageUrl: z.string().url().nullable(),
    groupAccess: z.array(z.string()),
    userAccess: z.array(z.string()),
    spaceAccess: z.array(z.string()),
    mcpServerUuids: z.array(z.string()),
    enableDataAccess: z.boolean(),
    enableSelfImprovement: z.boolean(),
    version: z.number(),
});

const createMcpServerFormSchema = z
    .object({
        name: z.string().trim().min(1, 'Name is required'),
        url: z.string().trim().url('Enter a valid URL'),
        authType: z.enum(['none', 'bearer']),
        bearerToken: z.string(),
    })
    .superRefine((values, ctx) => {
        if (
            values.authType === 'bearer' &&
            values.bearerToken.trim().length === 0
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Bearer token is required',
                path: ['bearerToken'],
            });
        }
    });

const CreateMcpServerModal = ({
    opened,
    isLoading,
    onClose,
    onSubmit,
}: {
    opened: boolean;
    isLoading: boolean;
    onClose: () => void;
    onSubmit: (
        values: z.infer<typeof createMcpServerFormSchema>,
    ) => Promise<void> | void;
}) => {
    const form = useForm<z.infer<typeof createMcpServerFormSchema>>({
        initialValues: {
            name: '',
            url: '',
            authType: 'none',
            bearerToken: '',
        },
        validate: zodResolver(createMcpServerFormSchema),
    });

    const handleClose = useCallback(() => {
        form.reset();
        onClose();
    }, [form, onClose]);

    const handleSubmit = form.onSubmit(async (values) => {
        await onSubmit(values);
        form.reset();
    });

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title="Create MCP server"
            icon={IconBrandSpeedtest}
            cancelDisabled={isLoading}
            actions={
                <Button
                    type="submit"
                    form="create-mcp-server-form"
                    loading={isLoading}
                >
                    Create MCP
                </Button>
            }
        >
            <form id="create-mcp-server-form" onSubmit={handleSubmit}>
                <Stack gap="md">
                    <TextInput
                        variant="subtle"
                        label="Name"
                        placeholder="Docs MCP"
                        disabled={isLoading}
                        {...form.getInputProps('name')}
                    />
                    <TextInput
                        variant="subtle"
                        label="URL"
                        placeholder="https://example.com/mcp"
                        disabled={isLoading}
                        {...form.getInputProps('url')}
                    />
                    <Box>
                        <Text size="sm" fw={500} mb="xs">
                            Auth type
                        </Text>
                        <SegmentedControl
                            fullWidth
                            data={[
                                { label: 'No auth', value: 'none' },
                                { label: 'Bearer token', value: 'bearer' },
                            ]}
                            disabled={isLoading}
                            value={form.values.authType}
                            onChange={(value) =>
                                form.setFieldValue(
                                    'authType',
                                    value as 'none' | 'bearer',
                                )
                            }
                        />
                    </Box>
                    {form.values.authType === 'bearer' && (
                        <Box>
                            <TextInput
                                variant="subtle"
                                placeholder="API key or personal access token"
                                disabled={isLoading}
                                {...form.getInputProps('bearerToken')}
                            />
                            <Text size="xs" c="dimmed" mt="xs">
                                The token will be encrypted and stored securely.
                                This credential will be shared across all users
                                of the agent.
                            </Text>
                        </Box>
                    )}
                </Stack>
            </form>
        </MantineModal>
    );
};

export const AiAgentFormSetup = ({
    mode,
    form,
    projectUuid,
    agentUuid,
}: {
    mode: 'create' | 'edit';
    form: ReturnType<typeof useForm<z.infer<typeof formSchema>>>;
    projectUuid: string;
    agentUuid: string;
}) => {
    const { data: project } = useProject(projectUuid);
    const exploreAccessSummaryQuery = useGetAgentExploreAccessSummary(
        projectUuid!,
        {
            tags: form.values.tags,
        },
    );

    const { mutateAsync: deleteAgent } = useDeleteAiAgentMutation(projectUuid!);

    const { user } = useApp();
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);

    const handleDeleteClick = useCallback(() => {
        setDeleteModalOpen(true);
    }, []);
    const handleCancelDelete = useCallback(() => {
        setDeleteModalOpen(false);
    }, []);
    const handleDelete = useCallback(async () => {
        if (!agentUuid || !user?.data || !projectUuid) {
            return;
        }

        await deleteAgent(agentUuid);

        setDeleteModalOpen(false);
    }, [agentUuid, deleteAgent, user?.data, projectUuid]);

    const [isExploreAccessSummaryOpen, { toggle: toggleExploreAccessSummary }] =
        useDisclosure(false);

    const slackChannelsConfigured = useMemo(
        () =>
            form.values.integrations.some(
                (i) => i.type === 'slack' && i.channelId,
            ),
        [form.values.integrations],
    );
    const { data: slackInstallation, isLoading: isLoadingSlackInstallation } =
        useGetSlack();

    const userGroupsFeatureFlagQuery = useServerFeatureFlag(
        FeatureFlags.UserGroupsEnabled,
    );

    const isGroupsEnabled =
        userGroupsFeatureFlagQuery.isSuccess &&
        userGroupsFeatureFlagQuery.data.enabled;

    const { data: groups, isLoading: isLoadingGroups } = useOrganizationGroups(
        {
            includeMembers: 5,
        },
        {
            enabled: isGroupsEnabled,
        },
    );

    const groupOptions = useMemo(
        () =>
            groups?.map((group) => ({
                value: group.uuid,
                label: group.name,
            })) ?? [],
        [groups],
    );

    const [isCreateMcpServerModalOpen, createMcpServerModalHandlers] =
        useDisclosure(false);
    const { data: mcpServers, isLoading: isLoadingMcpServers } =
        useProjectAiMcpServers(projectUuid);
    const { mutateAsync: createMcpServer, isLoading: isCreatingMcpServer } =
        useProjectCreateAiMcpServerMutation(projectUuid);

    const mcpServerOptions = useMemo(
        () => [
            ...(mcpServers?.map((mcpServer) => ({
                value: mcpServer.uuid,
                label: `${mcpServer.name} (${mcpServer.authType === 'bearer' ? 'Bearer' : 'No auth'})`,
            })) ?? []),
            {
                value: CREATE_MCP_SERVER_OPTION_VALUE,
                label: '+ Create new MCP',
            },
        ],
        [mcpServers],
    );

    const handleMcpServerChange = useCallback(
        (value: string[]) => {
            const selectedMcpServerUuids = value.filter(
                (item) => item !== CREATE_MCP_SERVER_OPTION_VALUE,
            );

            form.setFieldValue('mcpServerUuids', selectedMcpServerUuids);

            if (value.includes(CREATE_MCP_SERVER_OPTION_VALUE)) {
                createMcpServerModalHandlers.open();
            }
        },
        [createMcpServerModalHandlers, form],
    );

    const handleCreateMcpServer = useCallback(
        async (values: z.infer<typeof createMcpServerFormSchema>) => {
            const mcpServer = await createMcpServer({
                name: values.name.trim(),
                url: values.url.trim(),
                authType: values.authType,
                credentials:
                    values.authType === 'bearer'
                        ? {
                              bearerToken: values.bearerToken.trim(),
                          }
                        : null,
            });

            form.setFieldValue(
                'mcpServerUuids',
                Array.from(
                    new Set([...form.values.mcpServerUuids, mcpServer.uuid]),
                ),
            );
            createMcpServerModalHandlers.close();
        },
        [createMcpServer, createMcpServerModalHandlers, form],
    );

    return (
        <>
            <form>
                <Stack gap="sm">
                    <Paper p="xl">
                        <Group align="center" gap="xs" mb="md">
                            <Paper p="xxs" withBorder radius="sm">
                                <MantineIcon
                                    icon={IconAdjustmentsAlt}
                                    size="md"
                                />
                            </Paper>
                            <Title order={5} c="ldGray.9" fw={700}>
                                Basic information
                            </Title>
                        </Group>
                        <Stack>
                            <Group>
                                <TextInput
                                    label="Agent Name"
                                    placeholder="Enter a name for this agent"
                                    {...form.getInputProps('name')}
                                    style={{ flexGrow: 1 }}
                                    variant="subtle"
                                />
                                <Tooltip label="Agents can only be created within the context of the current project.">
                                    <TextInput
                                        label="Project"
                                        placeholder="Enter a project"
                                        value={project?.name}
                                        readOnly
                                        style={{ flexGrow: 1 }}
                                        variant="subtle"
                                    />
                                </Tooltip>
                            </Group>
                            <Textarea
                                variant="subtle"
                                label="Description"
                                description="A brief description of what this agent does and its purpose."
                                placeholder="Describe what this agent specializes in..."
                                minRows={3}
                                maxRows={6}
                                {...form.getInputProps('description')}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    form.setFieldValue(
                                        'description',
                                        value ? value : null,
                                    );
                                }}
                            />
                            <TextInput
                                style={{ flexGrow: 1 }}
                                miw={200}
                                variant="subtle"
                                label="Avatar image URL"
                                description="Please provide an image url like https://example.com/avatar.jpg. If not provided, a default avatar will be used."
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
                    </Paper>

                    <Paper p="xl">
                        <Stack gap="md">
                            <Group align="center" gap="xs">
                                <Paper p="xxs" withBorder radius="sm">
                                    <MantineIcon icon={IconBook2} size="md" />
                                </Paper>
                                <Title order={5} c="ldGray.9" fw={700}>
                                    Knowledge & expertise
                                </Title>
                            </Group>
                            <Stack gap="xs">
                                <Textarea
                                    variant="subtle"
                                    label="Instructions"
                                    description="Set the overall behavior and task for the agent. This defines how it should respond and what its purpose is."
                                    placeholder="You are a marketing analytics expert. Focus on campaign performance, customer acquisition costs, and ROI metrics. Always use bar charts and tables to visualize data."
                                    resize="vertical"
                                    autosize
                                    minRows={3}
                                    maxRows={8}
                                    {...form.getInputProps('instruction')}
                                />
                                <Text size="xs" c="dimmed">
                                    {form.values.instruction?.length ?? 0}{' '}
                                    characters
                                </Text>
                            </Stack>
                            <Stack gap="sm">
                                <Title
                                    order={6}
                                    c="ldGray.7"
                                    size="sm"
                                    fw={500}
                                >
                                    Quick Templates
                                </Title>

                                <InstructionsTemplates
                                    onSelect={(instruction: string) => {
                                        form.setFieldValue(
                                            'instruction',
                                            form.values.instruction
                                                ? `${form.values.instruction}\n\n${instruction}`
                                                : instruction,
                                        );
                                    }}
                                />
                            </Stack>
                            <Stack gap="sm">
                                <Box>
                                    <Title
                                        order={6}
                                        c="ldGray.7"
                                        size="sm"
                                        fw={500}
                                    >
                                        Guidelines
                                    </Title>
                                    <Text c="dimmed" size="xs">
                                        When writing instructions, consider the
                                        following guidelines to help the agent
                                        perform its tasks effectively.
                                    </Text>
                                </Box>
                                <InstructionsGuidelines />
                                <Text c="dimmed" size="xs">
                                    Visit our{' '}
                                    <Anchor
                                        href="https://docs.lightdash.com/guides/ai-agents#writing-effective-instructions"
                                        target="_blank"
                                    >
                                        docs
                                    </Anchor>{' '}
                                    to learn more about instructions and how
                                    they work.
                                </Text>
                            </Stack>
                            <Switch
                                variant="subtle"
                                label={
                                    <Group gap="xs">
                                        <Text fz="sm" fw={500}>
                                            Enable Data Access
                                        </Text>
                                        <Tooltip
                                            label="When enabled, the AI agent can analyze chart data and provide insights. When disabled, the agent only creates visualizations without accessing the underlying data."
                                            withArrow
                                            withinPortal
                                            multiline
                                            position="right"
                                            maw="300px"
                                        >
                                            <MantineIcon
                                                icon={IconInfoCircle}
                                            />
                                        </Tooltip>
                                    </Group>
                                }
                                description={
                                    <>
                                        Allows the agent to access and analyze
                                        the actual data behind charts to provide
                                        detailed insights and answer questions
                                        about the data.{' '}
                                        <Anchor
                                            href="https://docs.lightdash.com/guides/ai-agents#data-access-control"
                                            target="_blank"
                                            size="xs"
                                        >
                                            Learn more
                                        </Anchor>
                                    </>
                                }
                                {...form.getInputProps('enableDataAccess', {
                                    type: 'checkbox',
                                })}
                            />
                            <Switch
                                variant="subtle"
                                label={
                                    <Group gap="xs">
                                        <Text fz="sm" fw={500}>
                                            Enable Self-Improvement
                                        </Text>
                                        <Tooltip
                                            label="When enabled, the AI agent can make improvements to your semantic layer by updating field descriptions, creating new metrics, and refining dimensions based on user interactions."
                                            withArrow
                                            withinPortal
                                            multiline
                                            position="right"
                                            maw="300px"
                                        >
                                            <MantineIcon
                                                icon={IconInfoCircle}
                                            />
                                        </Tooltip>
                                        <Badge
                                            color="indigo"
                                            radius="sm"
                                            variant="light"
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconSparkles}
                                                />
                                            }
                                        >
                                            Beta
                                        </Badge>
                                    </Group>
                                }
                                description={
                                    <>
                                        Allows the agent to improve the
                                        project's explores by updating
                                        descriptions, creating metrics and
                                        dimensions based on conversations.
                                        Changes are tracked in changesets for
                                        review.{' '}
                                        <Anchor
                                            href="https://docs.lightdash.com/guides/ai-agents#self-improvement"
                                            target="_blank"
                                            size="xs"
                                        >
                                            Learn more
                                        </Anchor>
                                    </>
                                }
                                {...form.getInputProps(
                                    'enableSelfImprovement',
                                    {
                                        type: 'checkbox',
                                    },
                                )}
                            />
                        </Stack>
                    </Paper>

                    <Paper p="xl">
                        <Group align="center" gap="xs" mb="md">
                            <Paper p="xxs" withBorder radius="sm">
                                <MantineIcon
                                    icon={IconBrandSpeedtest}
                                    size="md"
                                />
                            </Paper>
                            <Title order={5} c="ldGray.9" fw={700}>
                                MCP servers
                            </Title>
                        </Group>
                        <Stack gap="sm">
                            <MultiSelect
                                variant="subtle"
                                placeholder={
                                    isLoadingMcpServers
                                        ? 'Loading MCP servers...'
                                        : mcpServers?.length
                                          ? 'Select MCP servers'
                                          : 'Create an MCP server first'
                                }
                                data={mcpServerOptions}
                                searchable
                                clearable
                                disabled={isLoadingMcpServers}
                                value={form.values.mcpServerUuids}
                                onChange={handleMcpServerChange}
                            />
                            {form.values.mcpServerUuids.length > 0 && (
                                <Text size="xs" c="dimmed">
                                    {form.values.mcpServerUuids.length} MCP
                                    {form.values.mcpServerUuids.length === 1
                                        ? ''
                                        : 's'}{' '}
                                    attached.
                                </Text>
                            )}
                        </Stack>
                    </Paper>

                    <Paper p="xl">
                        <Group align="center" gap="xs" mb="md">
                            <Paper p="xxs" withBorder radius="sm">
                                <MantineIcon icon={IconLock} size="md" />
                            </Paper>
                            <Title order={5} c="ldGray.9" fw={700}>
                                Access control
                            </Title>
                        </Group>
                        <Stack>
                            <UserAccessMultiSelect
                                projectUuid={projectUuid!}
                                isGroupsEnabled={isGroupsEnabled}
                                value={form.values.userAccess}
                                onChange={(value) => {
                                    form.setFieldValue('userAccess', value);
                                }}
                            />

                            {isGroupsEnabled && (
                                <Stack gap="xs">
                                    <MultiSelect
                                        variant="subtle"
                                        label={
                                            <Group gap="xs">
                                                <Text fz="sm" fw={500}>
                                                    Group Access
                                                </Text>
                                                <Tooltip
                                                    label="Admins and developers will always have access to this agent."
                                                    withArrow
                                                    withinPortal
                                                    multiline
                                                    position="right"
                                                    maw="250px"
                                                >
                                                    <MantineIcon
                                                        icon={IconInfoCircle}
                                                    />
                                                </Tooltip>
                                            </Group>
                                        }
                                        description="Select groups that can access this agent."
                                        placeholder={
                                            isLoadingGroups
                                                ? 'Loading groups...'
                                                : groupOptions.length === 0
                                                  ? 'No groups available'
                                                  : 'Select groups or leave empty for all users'
                                        }
                                        data={groupOptions}
                                        disabled={
                                            isLoadingGroups ||
                                            groupOptions.length === 0
                                        }
                                        comboboxProps={{
                                            transitionProps: {
                                                transition: 'pop',
                                                duration: 200,
                                            },
                                        }}
                                        clearable
                                        {...form.getInputProps('groupAccess')}
                                        value={
                                            form.getInputProps('groupAccess')
                                                .value ?? []
                                        }
                                        onChange={(value) => {
                                            form.setFieldValue(
                                                'groupAccess',
                                                value.length > 0 ? value : [],
                                            );
                                        }}
                                    />
                                </Stack>
                            )}

                            <SpaceAccessSelect
                                projectUuid={projectUuid}
                                value={form.values.spaceAccess}
                                onChange={(value) => {
                                    form.setFieldValue('spaceAccess', value);
                                }}
                            />

                            <Box>
                                <TagsInput
                                    variant="subtle"
                                    label={
                                        <Group gap="xs">
                                            <Text fz="sm" fw={500}>
                                                Tags
                                            </Text>
                                            <HoverCard
                                                position="right"
                                                withArrow
                                            >
                                                <HoverCard.Target>
                                                    <MantineIcon
                                                        icon={IconInfoCircle}
                                                    />
                                                </HoverCard.Target>
                                                <HoverCard.Dropdown maw="250px">
                                                    <Text fz="xs">
                                                        Add tags to control
                                                        which metrics and
                                                        dimensions your AI agent
                                                        can access. See more in
                                                        our{' '}
                                                        <Anchor
                                                            fz="xs"
                                                            c="dimmed"
                                                            underline="always"
                                                            href="https://docs.lightdash.com/guides/ai-agents#limiting-access-to-specific-explores-and-fields"
                                                            target="_blank"
                                                        >
                                                            docs
                                                        </Anchor>
                                                    </Text>
                                                </HoverCard.Dropdown>
                                            </HoverCard>
                                        </Group>
                                    }
                                    placeholder="Select tags"
                                    inputWrapperOrder={[
                                        'label',
                                        'input',
                                        'description',
                                    ]}
                                    description={
                                        exploreAccessSummaryQuery.isSuccess ? (
                                            exploreAccessSummaryQuery.data
                                                .length === 0 ? (
                                                'No explorers are available for this tag selection. Make sure to use the correct tags, or tag the project with the correct tags and redeploy the project.'
                                            ) : (
                                                <>
                                                    {
                                                        exploreAccessSummaryQuery
                                                            .data.length
                                                    }{' '}
                                                    explores will be available
                                                    to this agent.{' '}
                                                    <Anchor
                                                        size="xs"
                                                        onClick={
                                                            toggleExploreAccessSummary
                                                        }
                                                    >
                                                        Click here
                                                    </Anchor>{' '}
                                                    to see detailed list with
                                                    metrics and dimensions.
                                                </>
                                            )
                                        ) : (
                                            `Loading AI access information...`
                                        )
                                    }
                                    {...form.getInputProps('tags')}
                                    value={
                                        form.getInputProps('tags').value ?? []
                                    }
                                    onChange={(value) => {
                                        form.setFieldValue(
                                            'tags',
                                            value.length > 0 ? value : null,
                                        );
                                    }}
                                />

                                {exploreAccessSummaryQuery.isSuccess ? (
                                    <Collapse
                                        mt="xs"
                                        in={isExploreAccessSummaryOpen}
                                    >
                                        <Card>
                                            <AiExploreAccessTree
                                                exploreAccessSummary={
                                                    exploreAccessSummaryQuery.data
                                                }
                                            />
                                        </Card>
                                    </Collapse>
                                ) : null}
                            </Box>
                        </Stack>
                    </Paper>

                    <Paper p="xl">
                        <Group align="center" gap="xs" mb="md">
                            <Paper p="xxs" withBorder radius="sm">
                                <MantineIcon icon={IconPlug} size="md" />
                            </Paper>
                            <Title order={5} c="ldGray.9" fw={700}>
                                Integrations
                            </Title>
                        </Group>
                        <Stack gap="sm">
                            <Group
                                align="center"
                                justify="space-between"
                                gap="xs"
                            >
                                <Title order={6}>Slack</Title>
                                <Group
                                    c={
                                        slackChannelsConfigured
                                            ? 'green.4'
                                            : 'dimmed'
                                    }
                                    gap="xxs"
                                    align="flex-start"
                                >
                                    <MantineIcon
                                        icon={IconPointFilled}
                                        size={16}
                                    />
                                    <Text size="xs">
                                        {!slackInstallation?.organizationUuid
                                            ? 'Disabled'
                                            : !slackChannelsConfigured
                                              ? 'Channels not configured'
                                              : 'Enabled'}
                                    </Text>
                                </Group>
                            </Group>

                            <LoadingOverlay
                                visible={isLoadingSlackInstallation}
                            />
                            {!slackInstallation?.organizationUuid ? (
                                <Paper variant="dotted" p="sm">
                                    <Text size="xs" c="dimmed" ta="center">
                                        To enable AI agent interactions through
                                        Slack, please connect your Slack
                                        workspace in the{' '}
                                        <Anchor
                                            c="dimmed"
                                            underline="always"
                                            href="/generalSettings/integrations"
                                            target="_blank"
                                        >
                                            Integrations settings
                                        </Anchor>
                                        . Once connected, you can select
                                        channels where this agent will be
                                        available.
                                    </Text>
                                </Paper>
                            ) : (
                                <Box>
                                    <Stack gap="xs">
                                        <Text size="sm" c="dimmed">
                                            Select the channels where this agent
                                            will be available.
                                            {slackChannelsConfigured && (
                                                <>
                                                    {' '}
                                                    Tag the Slack app{' '}
                                                    <Code>
                                                        @
                                                        {
                                                            slackInstallation.appName
                                                        }
                                                    </Code>{' '}
                                                    to get started.
                                                </>
                                            )}
                                        </Text>
                                        <SlackChannelSelect
                                            includeGroups
                                            multiple
                                            withRefresh
                                            size="sm"
                                            variant="subtle"
                                            label="Channels"
                                            placeholder="Search channel(s)"
                                            value={form.values.integrations.map(
                                                (i) => i.channelId,
                                            )}
                                            onChange={(value) => {
                                                form.setFieldValue(
                                                    'integrations',
                                                    value.map(
                                                        (v) =>
                                                            ({
                                                                type: 'slack',
                                                                channelId: v,
                                                            }) as const,
                                                    ),
                                                );
                                            }}
                                        />
                                    </Stack>
                                </Box>
                            )}
                        </Stack>
                    </Paper>

                    {mode === 'edit' && (
                        <Paper p="xl" withBorder>
                            <Group align="center" gap="xs" mb="md">
                                <Paper p="xxs" withBorder radius="sm">
                                    <MantineIcon
                                        icon={IconAlertTriangle}
                                        size="md"
                                    />
                                </Paper>
                                <Title order={5} c="ldGray.9" fw={700}>
                                    Danger zone
                                </Title>
                            </Group>
                            <Group
                                gap="xs"
                                align="center"
                                justify="space-between"
                            >
                                <Box>
                                    <Title
                                        order={6}
                                        c="ldGray.7"
                                        size="sm"
                                        fw={500}
                                    >
                                        Delete agent
                                    </Title>
                                    <Text c="dimmed" size="xs">
                                        Deleting an agent will remove all its
                                        data and conversations.
                                    </Text>
                                </Box>
                                <Button
                                    variant="outline"
                                    color="red"
                                    onClick={handleDeleteClick}
                                    leftSection={
                                        <MantineIcon icon={IconTrash} />
                                    }
                                >
                                    Delete
                                </Button>
                            </Group>
                        </Paper>
                    )}
                </Stack>
            </form>
            <MantineModal
                opened={deleteModalOpen}
                onClose={handleCancelDelete}
                title="Delete Agent"
                variant="delete"
                resourceType="agent"
                description="This action cannot be undone."
                onConfirm={handleDelete}
            />
            <CreateMcpServerModal
                opened={isCreateMcpServerModalOpen}
                onClose={createMcpServerModalHandlers.close}
                onSubmit={handleCreateMcpServer}
                isLoading={isCreatingMcpServer}
            />
        </>
    );
};
