import { FeatureFlags, type AiAgentModelConfig } from '@lightdash/common';
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
    Radio,
    Select,
    Stack,
    Switch,
    TagsInput,
    Text,
    Textarea,
    type TextareaProps,
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
    IconUsers,
} from '@tabler/icons-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { z } from 'zod';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import { getModelKey } from '../../../../components/common/ModelSelector/utils';
import { SlackChannelSelect } from '../../../../components/common/SlackChannelSelect';
import { useGetSlack } from '../../../../hooks/slack/useSlack';
import { useOrganizationGroups } from '../../../../hooks/useOrganizationGroups';
import { useProject } from '../../../../hooks/useProject';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../providers/App/useApp';
import { UserAccessMultiSelect } from '../../../components/UserAccessMultiSelect';
import AiExploreAccessTree from '../../../pages/AiAgents/AiExploreAccessTree';
import {
    getAiAgentModelConfig,
    getModelOptionByKey,
    useDefaultAiAgentModel,
} from '../hooks/useAiAgentModelSelection';
import { useAiOrganizationSettings } from '../hooks/useAiOrganizationSettings';
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
    adminOnly: z.boolean(),
    modelConfig: z.custom<AiAgentModelConfig>().nullable(),
    version: z.number(),
});

type CommitOnBlurTextareaProps = Omit<
    TextareaProps,
    'defaultValue' | 'value' | 'onChange'
> & {
    defaultValue: string;
    onCommit: (value: string) => void;
};

const CommitOnBlurTextarea = memo(
    ({ defaultValue, onCommit, ...props }: CommitOnBlurTextareaProps) => (
        <Textarea
            defaultValue={defaultValue}
            onBlur={(e) => onCommit(e.currentTarget.value)}
            {...props}
        />
    ),
);

export const AiAgentFormSetup = ({
    mode,
    form,
    projectUuid,
    agentUuid,
    isSavingAgent,
    persistedMcpServerUuids,
    avatarMode,
    avatarFileName,
    onAvatarFileChange,
    onAvatarModeChange,
    onAvatarRemove,
    onAvatarRevert,
}: {
    mode: 'create' | 'edit';
    form: ReturnType<typeof useForm<z.infer<typeof formSchema>>>;
    projectUuid: string;
    agentUuid?: string;
    isSavingAgent?: boolean;
    persistedMcpServerUuids?: string[];
    avatarMode: 'upload' | 'link';
    avatarFileName: string | null;
    onAvatarFileChange: (file: File | null) => void;
    onAvatarModeChange: (mode: 'upload' | 'link') => void;
    onAvatarRemove: () => void;
    onAvatarRevert: (() => void) | null;
}) => {
    const { data: project } = useProject(projectUuid);
    const { data: aiOrganizationSettings } = useAiOrganizationSettings();
    const modelOptions = aiOrganizationSettings?.defaultAiAgentModelOptions;
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
    const {
        fallbackModelLabel: organizationDefaultModelLabel,
        selectedModel,
        selectedModelKey,
        showReasoningDefault,
    } = useDefaultAiAgentModel({
        modelOptions,
        modelConfig: form.values.modelConfig,
        fallbackModelConfig: aiOrganizationSettings?.defaultAiAgentModelConfig,
        fallbackLabel: 'Organization default',
    });

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

    // UI-only: keeps "Specific users & groups" selected after the user picks it
    // but before they add anyone (otherwise empty lists would read as "Everyone").
    const [showSpecificAccess, setShowSpecificAccess] = useState(false);

    const accessMode: 'everyone' | 'admins' | 'specific' = form.values.adminOnly
        ? 'admins'
        : showSpecificAccess ||
            form.values.userAccess.length > 0 ||
            form.values.groupAccess.length > 0
          ? 'specific'
          : 'everyone';

    const handleAccessModeChange = useCallback(
        (mode: string) => {
            if (mode === 'admins') {
                setShowSpecificAccess(false);
                form.setFieldValue('adminOnly', true);
                form.setFieldValue('userAccess', []);
                form.setFieldValue('groupAccess', []);
            } else if (mode === 'specific') {
                setShowSpecificAccess(true);
                form.setFieldValue('adminOnly', false);
            } else {
                setShowSpecificAccess(false);
                form.setFieldValue('adminOnly', false);
                form.setFieldValue('userAccess', []);
                form.setFieldValue('groupAccess', []);
            }
        },
        [form],
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
                            <CommitOnBlurTextarea
                                key={`description-${
                                    form.values.description != null
                                }`}
                                variant="subtle"
                                label="Description"
                                description="A brief description of what this agent does and its purpose."
                                placeholder="Describe what this agent specializes in..."
                                minRows={3}
                                maxRows={6}
                                error={form.errors.description}
                                defaultValue={form.values.description ?? ''}
                                onCommit={(value) =>
                                    form.setFieldValue(
                                        'description',
                                        value ? value : null,
                                    )
                                }
                            />
                            <Box>
                                <Text size="sm" fw={500}>
                                    Avatar
                                </Text>
                                <Text size="xs" c="dimmed" mt={2}>
                                    Upload an image (PNG, JPG, GIF) or use an
                                    image URL. Images are cropped to a square; a
                                    default avatar is used if none is set.
                                </Text>

                                {avatarMode === 'link' ? (
                                    <TextInput
                                        mt="sm"
                                        variant="subtle"
                                        label="Avatar image URL"
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
                                ) : (
                                    <Group align="center" gap="sm" mt="sm">
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
                                        {avatarFileName !== null && (
                                            <Text size="xs" c="dimmed">
                                                {avatarFileName}
                                            </Text>
                                        )}
                                    </Group>
                                )}

                                <Group gap="md" mt="xs">
                                    <Anchor
                                        component="button"
                                        type="button"
                                        size="xs"
                                        c="dimmed"
                                        onClick={() =>
                                            onAvatarModeChange(
                                                avatarMode === 'link'
                                                    ? 'upload'
                                                    : 'link',
                                            )
                                        }
                                    >
                                        {avatarMode === 'link'
                                            ? 'Upload an image instead'
                                            : 'Use an image URL instead'}
                                    </Anchor>
                                    {onAvatarRevert !== null && (
                                        <Anchor
                                            component="button"
                                            type="button"
                                            size="xs"
                                            c="dimmed"
                                            onClick={onAvatarRevert}
                                        >
                                            Revert
                                        </Anchor>
                                    )}
                                    {(avatarFileName !== null ||
                                        form.values.imageUrl) && (
                                        <Anchor
                                            component="button"
                                            type="button"
                                            size="xs"
                                            c="red"
                                            onClick={onAvatarRemove}
                                        >
                                            Remove
                                        </Anchor>
                                    )}
                                </Group>
                            </Box>
                        </Stack>
                    </Paper>

                    <Paper p="xl">
                        <Stack gap="md">
                            <Group align="center" gap="xs">
                                <Paper p="xxs" withBorder radius="sm">
                                    <MantineIcon
                                        icon={IconSparkles}
                                        size="md"
                                    />
                                </Paper>
                                <Title order={5} c="ldGray.9" fw={700}>
                                    Model
                                </Title>
                            </Group>

                            <Select
                                variant="subtle"
                                label="Default model"
                                description="Used for new chats with this agent. Users can still change it in each chat."
                                value={selectedModelKey}
                                disabled={
                                    isSavingAgent || !modelOptions?.length
                                }
                                placeholder={organizationDefaultModelLabel}
                                clearable
                                data={(modelOptions ?? []).map((model) => ({
                                    value: getModelKey(model),
                                    label: model.displayName,
                                }))}
                                onChange={(modelKey) => {
                                    const model = getModelOptionByKey(
                                        modelOptions,
                                        modelKey,
                                    );
                                    form.setFieldValue(
                                        'modelConfig',
                                        model
                                            ? (getAiAgentModelConfig(
                                                  model,
                                                  form.values.modelConfig
                                                      ?.reasoning ??
                                                      aiOrganizationSettings
                                                          ?.defaultAiAgentModelConfig
                                                          ?.reasoning ??
                                                      false,
                                              ) ?? null)
                                            : null,
                                    );
                                }}
                            />

                            {showReasoningDefault && (
                                <Switch
                                    variant="subtle"
                                    label="High reasoning"
                                    description="Use high reasoning for new chats with this agent."
                                    checked={
                                        form.values.modelConfig?.reasoning ===
                                        true
                                    }
                                    disabled={isSavingAgent}
                                    onChange={(event) => {
                                        if (!selectedModel) return;
                                        form.setFieldValue('modelConfig', {
                                            ...form.values.modelConfig,
                                            modelName: selectedModel.name,
                                            modelProvider:
                                                selectedModel.provider,
                                            reasoning:
                                                event.currentTarget.checked,
                                        });
                                    }}
                                />
                            )}
                        </Stack>
                    </Paper>

                    <Paper p="xl">
                        <Group align="center" gap="xs" mb="md">
                            <Paper p="xxs" withBorder radius="sm">
                                <MantineIcon icon={IconUsers} size="md" />
                            </Paper>
                            <Title order={5} c="ldGray.9" fw={700}>
                                Access control
                            </Title>
                        </Group>
                        <Stack>
                            <Radio.Group
                                value={accessMode}
                                onChange={handleAccessModeChange}
                            >
                                <Stack gap="sm">
                                    <Radio
                                        value="everyone"
                                        label="Everyone in the project"
                                        description="All project members can see and use this agent."
                                    />
                                    <Radio
                                        value="admins"
                                        label="Admins & developers only"
                                        description="Hidden from everyone else — useful while setting up or testing the agent."
                                    />
                                    <Radio
                                        value="specific"
                                        label={`Specific users ${isGroupsEnabled ? ' & groups' : ''}`}
                                        description={`Only the users${isGroupsEnabled ? ' and groups ' : ' '}you choose. Admins and developers always have access.`}
                                    />
                                </Stack>
                            </Radio.Group>

                            {accessMode === 'specific' && (
                                <Stack pl="xl">
                                    <UserAccessMultiSelect
                                        projectUuid={projectUuid!}
                                        isGroupsEnabled={isGroupsEnabled}
                                        value={form.values.userAccess}
                                        onChange={(value) => {
                                            form.setFieldValue(
                                                'userAccess',
                                                value,
                                            );
                                        }}
                                    />

                                    {isGroupsEnabled && (
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
                                    )}
                                </Stack>
                            )}
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
                                <CommitOnBlurTextarea
                                    key={`instruction-${
                                        form.values.instruction != null
                                    }`}
                                    variant="subtle"
                                    label="Instructions"
                                    description="Set the overall behavior and task for the agent. This defines how it should respond and what its purpose is."
                                    placeholder="You are a marketing analytics expert. Focus on campaign performance, customer acquisition costs, and ROI metrics. Always use bar charts and tables to visualize data."
                                    resize="vertical"
                                    autosize
                                    minRows={3}
                                    maxRows={8}
                                    error={form.errors.instruction}
                                    defaultValue={form.values.instruction ?? ''}
                                    onCommit={(value) =>
                                        form.setFieldValue(
                                            'instruction',
                                            value ? value : null,
                                        )
                                    }
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
                                {...form.getInputProps('enableContentTools', {
                                    type: 'checkbox',
                                })}
                                disabled={!form.values.enableDataAccess}
                            />
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
                                Data access
                            </Title>
                        </Group>
                        <Stack>
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
