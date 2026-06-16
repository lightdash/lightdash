import { FeatureFlags } from '@lightdash/common';
import {
    Anchor,
    Badge,
    Box,
    Button,
    Card,
    Code,
    Collapse,
    FileButton,
    Group,
    HoverCard,
    LoadingOverlay,
    MultiSelect,
    Paper,
    Stack,
    Switch,
    TagsInput,
    Text,
    Textarea,
    TextInput,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { type useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import {
    IconAdjustmentsAlt,
    IconAlertTriangle,
    IconBook2,
    IconInfoCircle,
    IconLock,
    IconPlug,
    IconPointFilled,
    IconSparkles,
    IconTrash,
    IconUpload,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState } from 'react';
import { z } from 'zod';
import { LightdashUserAvatar } from '../../../../components/Avatar';
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
import { useDeleteAiAgentMutation } from '../hooks/useProjectAiAgents';
import { useGetAgentExploreAccessSummary } from '../hooks/useUserAgentPreferences';
import { AiAgentKnowledgeFilesSection } from './AiAgentKnowledgeFilesSection';
import { AiAgentMcpServersInput } from './AiAgentMcpServersInput';
import { InstructionsGuidelines } from './InstructionsSupport';
import { SpaceAccessSelect } from './SpaceAccessSelect';

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
    enableContentTools: z.boolean(),
    version: z.number(),
});

export const AiAgentFormSetup = ({
    mode,
    form,
    projectUuid,
    agentUuid,
    isSavingAgent,
    persistedMcpServerUuids,
    avatarPreviewUrl,
    onAvatarFileChange,
    onAvatarRemove,
}: {
    mode: 'create' | 'edit';
    form: ReturnType<typeof useForm<z.infer<typeof formSchema>>>;
    projectUuid: string;
    agentUuid?: string;
    isSavingAgent?: boolean;
    persistedMcpServerUuids?: string[];
    avatarPreviewUrl: string | null;
    onAvatarFileChange: (file: File | null) => void;
    onAvatarRemove: () => void;
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
    const agentRevampFeatureFlagQuery = useServerFeatureFlag(
        FeatureFlags.AiAgentRevamp,
    );
    const isAgentRevampEnabled =
        agentRevampFeatureFlagQuery.isSuccess &&
        agentRevampFeatureFlagQuery.data.enabled;

    const handlePersistedMcpServerChange = useCallback(
        (value: string[]) => {
            const dirtyFields = Object.keys(form.values).reduce<
                Record<string, boolean>
            >((acc, field) => {
                if (
                    field !== 'mcpServerUuids' &&
                    form.isDirty(field as keyof typeof form.values)
                ) {
                    acc[field] = true;
                }

                return acc;
            }, {});

            form.resetDirty({
                ...form.values,
                mcpServerUuids: value,
            });
            form.setDirty(dirtyFields);
        },
        [form],
    );

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
                            <Box>
                                <Text size="sm" fw={500}>
                                    Avatar
                                </Text>
                                <Text size="xs" c="dimmed" mt={2}>
                                    Upload an image for the agent avatar. If not
                                    provided, a default avatar will be used.
                                </Text>
                                <Group align="center" gap="md" mt="xs">
                                    <LightdashUserAvatar
                                        src={avatarPreviewUrl ?? undefined}
                                        name={form.values.name || 'Agent'}
                                        size="lg"
                                    />
                                    <Group gap="xs">
                                        <FileButton
                                            accept="image/png,image/jpeg,image/gif"
                                            onChange={onAvatarFileChange}
                                        >
                                            {(props) => (
                                                <Button
                                                    {...props}
                                                    size="xs"
                                                    variant="light"
                                                    leftSection={
                                                        <MantineIcon
                                                            icon={IconUpload}
                                                        />
                                                    }
                                                >
                                                    Upload image
                                                </Button>
                                            )}
                                        </FileButton>
                                        {avatarPreviewUrl && (
                                            <Button
                                                size="xs"
                                                variant="subtle"
                                                color="red"
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconTrash}
                                                    />
                                                }
                                                onClick={onAvatarRemove}
                                            >
                                                Remove
                                            </Button>
                                        )}
                                    </Group>
                                </Group>
                            </Box>
                            <Text size="xs" c="dimmed">
                                Supported formats: PNG, JPG, GIF. Uploaded
                                avatars are normalized to a square image.
                            </Text>
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
                            {agentUuid && (
                                <AiAgentKnowledgeFilesSection
                                    agentUuid={agentUuid}
                                    projectUuid={projectUuid}
                                />
                            )}
                            <Stack gap="sm">
                                <Box>
                                    <Title
                                        order={6}
                                        c="ldGray.7"
                                        size="sm"
                                        fw={500}
                                    >
                                        Configuration
                                    </Title>
                                    <Text c="dimmed" size="xs">
                                        Control how this agent interacts with
                                        your data and semantic layer.
                                    </Text>
                                </Box>
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
                                onChange={(event) => {
                                    const enabled = event.currentTarget.checked;

                                    form.setFieldValue(
                                        'enableDataAccess',
                                        enabled,
                                    );

                                    if (!enabled) {
                                        form.setFieldValue(
                                            'enableContentTools',
                                            false,
                                        );
                                    }
                                }}
                            />
                            {isAgentRevampEnabled && (
                                <Switch
                                    variant="subtle"
                                    label={
                                        <Group gap="xs">
                                            <Text fz="sm" fw={500}>
                                                Allow agent to manage Lightdash
                                                content
                                            </Text>
                                            <Tooltip
                                                label="Requires data access to be enabled. Only works for users with content-as-code access (admins and developers)."
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
                                        'Agent can build new dashboards and charts and update existing ones — add or rearrange tiles, organize tabs, change filters, and more.'
                                    }
                                    {...form.getInputProps(
                                        'enableContentTools',
                                        {
                                            type: 'checkbox',
                                        },
                                    )}
                                    disabled={!form.values.enableDataAccess}
                                />
                            )}
                        </Stack>
                    </Paper>

                    <AiAgentMcpServersInput
                        agentUuid={agentUuid}
                        isSavingAgent={isSavingAgent}
                        onPersistedChange={handlePersistedMcpServerChange}
                        persistedMcpServerUuids={persistedMcpServerUuids}
                        projectUuid={projectUuid}
                        value={form.values.mcpServerUuids}
                        onChange={(value) => {
                            form.setFieldValue('mcpServerUuids', value);
                        }}
                    />

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
        </>
    );
};
