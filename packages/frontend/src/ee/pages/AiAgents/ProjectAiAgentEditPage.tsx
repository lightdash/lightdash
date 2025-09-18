import {
    FeatureFlags,
    getHighestProjectRole,
    ProjectMemberRole,
    ProjectMemberRoleLabels,
    ProjectRoleOrder,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Badge,
    Box,
    Button,
    Card,
    Code,
    Collapse,
    Container,
    Group,
    HoverCard,
    Loader,
    LoadingOverlay,
    MultiSelect,
    Paper,
    Stack,
    Switch,
    Tabs,
    TagsInput,
    Text,
    Textarea,
    TextInput,
    Title,
    Tooltip,
    type ComboboxItem,
    type ComboboxLikeRenderOptionInput,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import { useForm, zodResolver } from '@mantine/form';
import {
    IconAdjustmentsAlt,
    IconAlertTriangle,
    IconArrowLeft,
    IconBook2,
    IconCheck,
    IconExternalLink,
    IconInfoCircle,
    IconLock,
    IconPlug,
    IconPointFilled,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { LightdashUserAvatar } from '../../../components/Avatar';
import LinkButton from '../../../components/common/LinkButton';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useGetSlack, useSlackChannels } from '../../../hooks/slack/useSlack';
import { useFeatureFlag } from '../../../hooks/useFeatureFlagEnabled';
import { useOrganizationGroups } from '../../../hooks/useOrganizationGroups';
import { useProject } from '../../../hooks/useProject';
import { useProjectUsersWithRoles } from '../../../hooks/useProjectUsersWithRoles';
import useApp from '../../../providers/App/useApp';
import { AiAgentEditPageLayout } from '../../features/aiCopilot/components/AiAgentEditPageLayout/AiAgentEditPageLayout';
import {
    InstructionsGuidelines,
    InstructionsTemplates,
} from '../../features/aiCopilot/components/InstructionsSupport';
import { useAiAgentPermission } from '../../features/aiCopilot/hooks/useAiAgentPermission';
import {
    useDeleteAiAgentMutation,
    useProjectAiAgent,
    useProjectAiAgents,
    useProjectCreateAiAgentMutation,
    useProjectUpdateAiAgentMutation,
} from '../../features/aiCopilot/hooks/useProjectAiAgents';
import { useGetAgentExploreAccessSummary } from '../../features/aiCopilot/hooks/useUserAgentPreferences';
import AiExploreAccessTree from './AiExploreAccessTree';

const formSchema = z.object({
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
    groupAccess: z.array(z.string()),
    userAccess: z.array(z.string()),
    enableDataAccess: z.boolean(),
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
    const { user } = useApp();

    const [deleteModalOpen, setDeleteModalOpen] = useState(false);

    const { data: project } = useProject(projectUuid);
    const { mutateAsync: createAgent, isLoading: isCreating } =
        useProjectCreateAiAgentMutation(projectUuid!);
    const { mutateAsync: updateAgent, isLoading: isUpdating } =
        useProjectUpdateAiAgentMutation(projectUuid!);
    const { mutateAsync: deleteAgent } = useDeleteAiAgentMutation(projectUuid!);

    const actualAgentUuid = !isCreateMode && agentUuid ? agentUuid : undefined;

    const { data: agent, isLoading: isLoadingAgent } = useProjectAiAgent(
        projectUuid,
        actualAgentUuid,
    );

    const { data: slackInstallation, isLoading: isLoadingSlackInstallation } =
        useGetSlack();

    const { data: agents, isSuccess: isSuccessAgents } = useProjectAiAgents({
        projectUuid,
        redirectOnUnauthorized: true,
    });

    const userGroupsFeatureFlagQuery = useFeatureFlag(
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

    const {
        usersWithProjectRole,
        usersDictionary,
        isLoading: isLoadingProjectUsers,
    } = useProjectUsersWithRoles(projectUuid!);

    const {
        data: slackChannels,
        refresh: refreshChannels,
        isRefreshing,
        isLoading: isLoadingSlackChannels,
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

    const groupOptions = useMemo(
        () =>
            groups?.map((group) => ({
                value: group.uuid,
                label: group.name,
            })) ?? [],
        [groups],
    );

    const userOptions = useMemo(
        () =>
            usersWithProjectRole
                // Filter out users who cannot view/interact with ai agents
                // Filter out users that have default access to the ai agent - admins and developers
                ?.filter((u) => {
                    const userFromDictionary = usersDictionary[u.userUuid];
                    const highestRole = userFromDictionary.inheritedRole
                        ? getHighestProjectRole(
                              userFromDictionary.inheritedRole,
                          )
                        : undefined;

                    const canCreateAiAgents =
                        highestRole &&
                        (highestRole.role === ProjectMemberRole.ADMIN ||
                            highestRole.role === ProjectMemberRole.DEVELOPER);
                    const canInteractWithAiAgents =
                        highestRole &&
                        ProjectRoleOrder[highestRole.role] >=
                            ProjectRoleOrder[
                                ProjectMemberRole.INTERACTIVE_VIEWER
                            ] &&
                        !canCreateAiAgents;
                    return canInteractWithAiAgents;
                })
                ?.map((userOption) => ({
                    value: userOption.userUuid,
                    label:
                        `${userOption.firstName} ${userOption.lastName}`.trim() ||
                        userOption.email,
                })) ?? [],
        [usersWithProjectRole, usersDictionary],
    );

    const renderMultiSelectOption: (
        item: ComboboxLikeRenderOptionInput<ComboboxItem>,
    ) => React.ReactNode = ({ option }) => {
        const userFromDictionary = usersDictionary[option.value];
        if (!userFromDictionary) return null;

        const highestRole = userFromDictionary.inheritedRole
            ? getHighestProjectRole(userFromDictionary.inheritedRole)
            : undefined;

        if (!highestRole) return null;

        return (
            <Group gap="sm">
                <LightdashUserAvatar
                    name={
                        userFromDictionary.firstName +
                        ' ' +
                        userFromDictionary.lastName
                    }
                    size="sm"
                    radius="xl"
                />
                <Stack gap="two">
                    <Group gap="xs">
                        <Text size="sm" fw={500}>
                            {option.label}
                        </Text>
                        <Badge
                            size="xs"
                            p="2px 4px"
                            radius="sm"
                            variant="outline"
                            color="gray.6"
                            fz="8px"
                        >
                            {ProjectMemberRoleLabels[highestRole.role]}
                        </Badge>
                    </Group>
                    <Text size="xs" c="dimmed" fw={400}>
                        {userFromDictionary.email}
                    </Text>
                </Stack>
            </Group>
        );
    };

    const form = useForm<z.infer<typeof formSchema>>({
        initialValues: {
            name: '',
            integrations: [],
            tags: null,
            instruction: null,
            imageUrl: null,
            groupAccess: [],
            userAccess: [],
            enableDataAccess: false,
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
                groupAccess: agent.groupAccess ?? [],
                userAccess: agent.userAccess ?? [],
                enableDataAccess: agent.enableDataAccess ?? false,
            };
            form.setValues(values);
            form.resetDirty(values);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agent, isCreateMode]);

    const [isExploreAccessSummaryOpen, { toggle: toggleExploreAccessSummary }] =
        useDisclosure(false);

    const exploreAccessSummaryQuery = useGetAgentExploreAccessSummary(
        projectUuid!,
        {
            tags: form.values.tags,
        },
    );

    const slackChannelsConfigured = useMemo(
        () =>
            form.values.integrations.some(
                (i) => i.type === 'slack' && i.channelId,
            ),
        [form.values.integrations],
    );

    const handleBack = () => {
        void navigate(-1);
    };

    const handleSubmit = form.onSubmit(async (values) => {
        if (!projectUuid || !user?.data) {
            return;
        }

        if (isCreateMode) {
            await createAgent({
                ...values,
                projectUuid,
            });
        } else if (actualAgentUuid) {
            await updateAgent({
                uuid: actualAgentUuid,
                projectUuid,
                ...values,
            });
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

        setDeleteModalOpen(false);
    }, [actualAgentUuid, deleteAgent, user?.data, projectUuid, agent]);

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
            <Container py="xl">
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
                    <Paper
                        p="xl"
                        shadow="subtle"
                        component={Stack}
                        gap="xxs"
                        align="center"
                        withBorder
                        style={{ borderStyle: 'dashed' }}
                    >
                        <Title order={5}>Agent not found</Title>
                        <Text size="sm" c="dimmed">
                            The agent you are looking for does not exist.
                        </Text>
                    </Paper>
                </Stack>
            </Container>
        );
    }

    return (
        <AiAgentEditPageLayout
            header={
                <Stack gap="xs" align="flex-start">
                    <Button
                        variant="subtle"
                        leftSection={<MantineIcon icon={IconArrowLeft} />}
                        onClick={handleBack}
                    >
                        Back
                    </Button>

                    <Group
                        justify="space-between"
                        wrap="nowrap"
                        align="center"
                        w="100%"
                    >
                        <Group gap="sm" align="center" flex="1" wrap="nowrap">
                            <LightdashUserAvatar
                                name={isCreateMode ? '+' : form.values.name}
                                variant="filled"
                                src={
                                    !isCreateMode
                                        ? form.values.imageUrl
                                        : undefined
                                }
                                size={48}
                            />
                            <Stack gap={0}>
                                <Group gap="xs" wrap="nowrap">
                                    <Title order={2} lineClamp={1} w="100%">
                                        {isCreateMode
                                            ? 'New Agent'
                                            : agent?.name || 'Agent'}
                                    </Title>

                                    {!isCreateMode && agent && (
                                        <LinkButton
                                            href={`/ai-agents/admin?agents=${agent?.uuid}&projects=${projectUuid}`}
                                            target="_blank"
                                            variant="light"
                                            size="sm"
                                            leftIcon={IconExternalLink}
                                        >
                                            Conversations
                                        </LinkButton>
                                    )}
                                </Group>
                                <Text size="xs" c="dimmed">
                                    Last modified:{' '}
                                    {new Date(
                                        agent?.updatedAt ?? new Date(),
                                    ).toLocaleString()}
                                </Text>
                            </Stack>
                        </Group>
                        <Group justify="flex-end" gap="xs">
                            <Button
                                variant="outline"
                                onClick={() => handleSubmit()}
                                loading={isCreating || isUpdating}
                                leftSection={<MantineIcon icon={IconCheck} />}
                                disabled={
                                    isCreateMode
                                        ? !form.isValid()
                                        : !form.isDirty()
                                }
                            >
                                {isCreateMode ? 'Create agent' : 'Save changes'}
                            </Button>
                        </Group>
                    </Group>
                </Stack>
            }
        >
            <Stack gap="xs">
                <Tabs defaultValue="setup" keepMounted={false}>
                    {!isCreateMode && (
                        <Tabs.List>
                            <Tabs.Tab value="setup">Setup</Tabs.Tab>
                        </Tabs.List>
                    )}

                    <Tabs.Panel value="setup" pt="lg">
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
                                        <Title order={5} c="gray.9" fw={700}>
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
                                            <Tooltip label="Agents can only be created in the context the current project">
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
                                    <Group align="center" gap="xs" mb="md">
                                        <Paper p="xxs" withBorder radius="sm">
                                            <MantineIcon
                                                icon={IconLock}
                                                size="md"
                                            />
                                        </Paper>
                                        <Title order={5} c="gray.9" fw={700}>
                                            Access control
                                        </Title>
                                    </Group>
                                    <Stack>
                                        <MultiSelect
                                            variant="subtle"
                                            renderOption={
                                                renderMultiSelectOption
                                            }
                                            hidePickedOptions
                                            label={
                                                <Group gap="xs">
                                                    <Text fz="sm" fw={500}>
                                                        User Access
                                                    </Text>
                                                    <Tooltip
                                                        label="Admins and developers will always have access."
                                                        withArrow
                                                        withinPortal
                                                        multiline
                                                        position="right"
                                                        maw="250px"
                                                    >
                                                        <MantineIcon
                                                            icon={
                                                                IconInfoCircle
                                                            }
                                                        />
                                                    </Tooltip>
                                                </Group>
                                            }
                                            description={`Select specific users from this project who can access this agent. ${
                                                isGroupsEnabled
                                                    ? 'If no users are selected, access will be determined by group settings.'
                                                    : ''
                                            }`}
                                            placeholder={
                                                isLoadingProjectUsers
                                                    ? 'Loading users...'
                                                    : userOptions.length === 0
                                                    ? 'No users available'
                                                    : 'Select users'
                                            }
                                            data={userOptions}
                                            disabled={
                                                isLoadingProjectUsers ||
                                                userOptions.length === 0
                                            }
                                            clearable
                                            searchable
                                            comboboxProps={{
                                                transitionProps: {
                                                    transition: 'pop',
                                                    duration: 200,
                                                },
                                            }}
                                            {...form.getInputProps(
                                                'userAccess',
                                            )}
                                            value={form.values.userAccess.filter(
                                                (userUuid: string) =>
                                                    userOptions.some(
                                                        (u) =>
                                                            u.value ===
                                                            userUuid,
                                                    ),
                                            )}
                                            onChange={(value) => {
                                                form.setFieldValue(
                                                    'userAccess',
                                                    value.length > 0
                                                        ? value
                                                        : [],
                                                );
                                            }}
                                        />

                                        {isGroupsEnabled && (
                                            <Stack gap="xs">
                                                <MultiSelect
                                                    variant="subtle"
                                                    label={
                                                        <Group gap="xs">
                                                            <Text
                                                                fz="sm"
                                                                fw={500}
                                                            >
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
                                                                    icon={
                                                                        IconInfoCircle
                                                                    }
                                                                />
                                                            </Tooltip>
                                                        </Group>
                                                    }
                                                    description="Select groups that can access this agent."
                                                    placeholder={
                                                        isLoadingGroups
                                                            ? 'Loading groups...'
                                                            : groupOptions.length ===
                                                              0
                                                            ? 'No groups available'
                                                            : 'Select groups or leave empty for all users'
                                                    }
                                                    data={groupOptions}
                                                    disabled={
                                                        isLoadingGroups ||
                                                        groupOptions.length ===
                                                            0
                                                    }
                                                    comboboxProps={{
                                                        transitionProps: {
                                                            transition: 'pop',
                                                            duration: 200,
                                                        },
                                                    }}
                                                    clearable
                                                    {...form.getInputProps(
                                                        'groupAccess',
                                                    )}
                                                    value={
                                                        form.getInputProps(
                                                            'groupAccess',
                                                        ).value ?? []
                                                    }
                                                    onChange={(value) => {
                                                        form.setFieldValue(
                                                            'groupAccess',
                                                            value.length > 0
                                                                ? value
                                                                : [],
                                                        );
                                                    }}
                                                />
                                            </Stack>
                                        )}

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
                                                                    icon={
                                                                        IconInfoCircle
                                                                    }
                                                                />
                                                            </HoverCard.Target>
                                                            <HoverCard.Dropdown maw="250px">
                                                                <Text fz="xs">
                                                                    Add tags to
                                                                    control
                                                                    which
                                                                    metrics and
                                                                    dimensions
                                                                    your AI
                                                                    agent can
                                                                    access. See
                                                                    more in our{' '}
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
                                                        exploreAccessSummaryQuery
                                                            .data.length ===
                                                        0 ? (
                                                            'No explorers are available for this tag selection. Make sure to use the correct tags, or tag the project with the correct tags and redeploy the project.'
                                                        ) : (
                                                            <>
                                                                {
                                                                    exploreAccessSummaryQuery
                                                                        .data
                                                                        .length
                                                                }{' '}
                                                                explores will be
                                                                available to
                                                                this agent.{' '}
                                                                <Anchor
                                                                    size="xs"
                                                                    onClick={
                                                                        toggleExploreAccessSummary
                                                                    }
                                                                >
                                                                    Click here
                                                                </Anchor>{' '}
                                                                to see detailed
                                                                list with
                                                                metrics and
                                                                dimensions.
                                                            </>
                                                        )
                                                    ) : (
                                                        `Loading AI access information...`
                                                    )
                                                }
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

                                            {exploreAccessSummaryQuery.isSuccess ? (
                                                <Collapse
                                                    mt="xs"
                                                    in={
                                                        isExploreAccessSummaryOpen
                                                    }
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
                                    <Stack gap="md">
                                        <Group align="center" gap="xs">
                                            <Paper
                                                p="xxs"
                                                withBorder
                                                radius="sm"
                                            >
                                                <MantineIcon
                                                    icon={IconBook2}
                                                    size="md"
                                                />
                                            </Paper>
                                            <Title
                                                order={5}
                                                c="gray.9"
                                                fw={700}
                                            >
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
                                                {...form.getInputProps(
                                                    'instruction',
                                                )}
                                            />
                                            <Text size="xs" c="dimmed">
                                                {form.values.instruction
                                                    ?.length ?? 0}{' '}
                                                characters
                                            </Text>
                                        </Stack>
                                        <Stack gap="sm">
                                            <Title
                                                order={6}
                                                c="gray.7"
                                                size="sm"
                                                fw={500}
                                            >
                                                Quick Templates
                                            </Title>

                                            <InstructionsTemplates
                                                onSelect={(
                                                    instruction: string,
                                                ) => {
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
                                                    c="gray.7"
                                                    size="sm"
                                                    fw={500}
                                                >
                                                    Guidelines
                                                </Title>
                                                <Text c="dimmed" size="xs">
                                                    When writing instructions,
                                                    consider the following
                                                    guidelines to help the agent
                                                    perform its tasks
                                                    effectively.
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
                                                to learn more about instructions
                                                and how they work.
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
                                                            icon={
                                                                IconInfoCircle
                                                            }
                                                        />
                                                    </Tooltip>
                                                </Group>
                                            }
                                            description={
                                                <>
                                                    Allows the agent to access
                                                    and analyze the actual data
                                                    behind charts to provide
                                                    detailed insights and answer
                                                    questions about the data.{' '}
                                                    <Anchor
                                                        href="https://docs.lightdash.com/guides/ai-agents#data-access-control"
                                                        target="_blank"
                                                        size="xs"
                                                    >
                                                        Learn more
                                                    </Anchor>
                                                </>
                                            }
                                            {...form.getInputProps(
                                                'enableDataAccess',
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
                                                icon={IconPlug}
                                                size="md"
                                            />
                                        </Paper>
                                        <Title order={5} c="gray.9" fw={700}>
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
                                                        ? 'green.04'
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
                                            <Paper
                                                withBorder
                                                p="sm"
                                                style={{
                                                    borderStyle: 'dashed',
                                                    backgroundColor:
                                                        'transparent',
                                                }}
                                            >
                                                <Text
                                                    size="xs"
                                                    c="dimmed"
                                                    ta="center"
                                                >
                                                    To enable AI agent
                                                    interactions through Slack,
                                                    please connect your Slack
                                                    workspace in the{' '}
                                                    <Anchor
                                                        c="dimmed"
                                                        underline="always"
                                                        href="/generalSettings/integrations"
                                                        target="_blank"
                                                    >
                                                        Integrations settings
                                                    </Anchor>
                                                    . Once connected, you can
                                                    select channels where this
                                                    agent will be available.
                                                </Text>
                                            </Paper>
                                        ) : (
                                            <Box>
                                                <Stack gap="xs">
                                                    <MultiSelect
                                                        variant="subtle"
                                                        readOnly={
                                                            isLoadingSlackChannels ||
                                                            isRefreshing
                                                        }
                                                        description={
                                                            <>
                                                                Select the
                                                                channels where
                                                                this agent will
                                                                be available.
                                                                {slackChannelsConfigured && (
                                                                    <>
                                                                        {' '}
                                                                        Tag the
                                                                        Slack
                                                                        app{' '}
                                                                        <Code>
                                                                            @
                                                                            {
                                                                                slackInstallation.appName
                                                                            }
                                                                        </Code>{' '}
                                                                        to get
                                                                        started.
                                                                    </>
                                                                )}
                                                            </>
                                                        }
                                                        labelProps={{
                                                            style: {
                                                                width: '100%',
                                                            },
                                                        }}
                                                        label={'Channels'}
                                                        limit={30}
                                                        placeholder={
                                                            isLoadingSlackChannels ||
                                                            isRefreshing
                                                                ? 'Loading channels, this might take a while if you have a lot of channels in your workspace'
                                                                : 'Search channel(s)'
                                                        }
                                                        data={
                                                            slackChannelOptions
                                                        }
                                                        value={form.values.integrations.map(
                                                            (i) => i.channelId,
                                                        )}
                                                        searchable
                                                        rightSectionPointerEvents="all"
                                                        rightSection={
                                                            isLoadingSlackChannels ||
                                                            isRefreshing ? (
                                                                <Loader size="xs" />
                                                            ) : (
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
                                                            )
                                                        }
                                                        onChange={(value) => {
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
                                </Paper>

                                {!isCreateMode && (
                                    <Paper p="xl" withBorder>
                                        <Group align="center" gap="xs" mb="md">
                                            <Paper
                                                p="xxs"
                                                withBorder
                                                radius="sm"
                                            >
                                                <MantineIcon
                                                    icon={IconAlertTriangle}
                                                    size="md"
                                                />
                                            </Paper>
                                            <Title
                                                order={5}
                                                c="gray.9"
                                                fw={700}
                                            >
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
                                                    c="gray.7"
                                                    size="sm"
                                                    fw={500}
                                                >
                                                    Delete agent
                                                </Title>
                                                <Text c="dimmed" size="xs">
                                                    Deleting an agent will
                                                    remove all its data and
                                                    conversations.
                                                </Text>
                                            </Box>
                                            <Button
                                                variant="outline"
                                                color="red"
                                                onClick={handleDeleteClick}
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconTrash}
                                                    />
                                                }
                                            >
                                                Delete
                                            </Button>
                                        </Group>
                                    </Paper>
                                )}
                            </Stack>
                        </form>
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
        </AiAgentEditPageLayout>
    );
};

export default ProjectAiAgentEditPage;
